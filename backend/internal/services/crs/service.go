// Package crs implements the Change Request workflow: a browser-held working
// branch is proposed against a base revision of main, reviewed, and either
// merged (moving main forward with a new immutable revision) or closed. All
// authorization goes through permissions.Checker; the server-side checks are
// the only real boundary.
package crs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/redline"
	"github.com/kenoma/backend/internal/services/permissions"
)

var (
	ErrValidation = errors.New("validation failed")
	ErrNotFound   = errors.New("not found")
	// ErrConflict means main moved past the CR's base revision since it was
	// opened. The merger must supply a resolution to proceed.
	ErrConflict = errors.New("main has moved since this change request was opened")
	// ErrNotOpen covers merge/close racing each other: one statement's status
	// predicate matches no row because the other ran first.
	ErrNotOpen           = errors.New("change request is no longer open")
	ErrTooLarge          = errors.New("content too large")
	ErrWorkstreamChanged = errors.New("workstream changed")
)

const (
	KindEdit   = "edit"
	KindImport = "import"

	maxContentBytes  = 1 << 20
	maxCommentBytes  = 20 << 10
	maxAnchorJSONLen = 4 << 10
)

type Service struct {
	Queries db.Querier
	Pool    *pgxpool.Pool
	Checker *permissions.Checker
}

func New(queries db.Querier, pool *pgxpool.Pool, checker *permissions.Checker) *Service {
	return &Service{Queries: queries, Pool: pool, Checker: checker}
}

// View pairs a Change Request with the document state a client needs around
// it: which project to ask permissions for, and whether main still sits on
// the base revision (false means merging requires conflict resolution).
type View struct {
	CR              db.ChangeRequest `json:"change_request"`
	Document        db.Document      `json:"document"`
	HeadMatchesBase bool             `json:"head_matches_base"`
}

type OpenParams struct {
	BaseRevisionID  uuid.UUID // optional: zero means "base on current head"
	Title           string
	ContentMarkdown string
	Kind            string
}

// Open records a proposal server-side. Until this moment the working branch
// lived only in the contributor's browser; from here on the snapshot is
// durable and auditable.
func (s *Service) Open(ctx context.Context, userID, documentID uuid.UUID, p OpenParams) (View, error) {
	if p.Kind != KindEdit && p.Kind != KindImport {
		return View{}, fmt.Errorf("%w: unknown change request kind", ErrValidation)
	}
	if p.Kind == KindEdit {
		return View{}, fmt.Errorf("%w: edit change requests require a workstream", ErrValidation)
	}
	title := strings.TrimSpace(p.Title)
	if title == "" {
		return View{}, fmt.Errorf("%w: title is required", ErrValidation)
	}
	// Byte length, not rune count: the cap exists to bound memory.
	if len(p.ContentMarkdown) > maxContentBytes {
		return View{}, ErrTooLarge
	}
	// Opening an edit CR is the submit-for-review step, so docs:submit_review
	// gates it; an import CR carries the importer's content, so docs:import
	// does. Either grant implies visibility, since grants are per project.
	key := permissions.KeySubmitReview
	if p.Kind == KindImport {
		key = permissions.KeyImport
	}
	doc, err := s.Queries.GetDocumentByID(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, key)
	if err != nil {
		return View{}, err
	}
	if !allowed {
		return View{}, permissions.ErrDenied
	}

	base := p.BaseRevisionID
	if base == uuid.Nil {
		if !doc.HeadRevisionID.Valid {
			return View{}, fmt.Errorf("%w: document has no head revision", ErrValidation)
		}
		base = doc.HeadRevisionID.UUID
	} else if _, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
		ID:         base,
		DocumentID: documentID,
	}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, fmt.Errorf("%w: base revision does not belong to this document", ErrValidation)
		}
		return View{}, err
	}

	cr, err := s.Queries.CreateChangeRequest(ctx, db.CreateChangeRequestParams{
		DocumentID:      documentID,
		BaseRevisionID:  base,
		Kind:            p.Kind,
		Title:           title,
		ContentMarkdown: p.ContentMarkdown,
		OpenedBy:        userID,
	})
	if err != nil {
		return View{}, err
	}
	return s.view(ctx, cr, doc), nil
}

// OpenFromWorkstream atomically freezes every saved Change Log into one
// Change Request. The final log remains denormalized on the CR so merge and
// aggregate diff behavior stay immutable and cheap.
func (s *Service) OpenFromWorkstream(ctx context.Context, userID, documentID, workstreamID, expectedLatestID uuid.UUID) (View, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return View{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)

	doc, err := q.GetDocumentByID(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	allowed, err := permissions.New(q).HasPermission(ctx, userID, doc.ProjectID, permissions.KeySubmitReview)
	if err != nil {
		return View{}, err
	}
	if !allowed {
		return View{}, permissions.ErrDenied
	}
	w, err := q.GetDocumentWorkstreamForUpdate(ctx, db.GetDocumentWorkstreamForUpdateParams{
		ID: workstreamID, DocumentID: documentID, OwnerID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	latest, err := q.GetLatestChangeLog(ctx, db.GetLatestChangeLogParams{
		WorkstreamID: w.ID, DocumentID: documentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, fmt.Errorf("%w: workstream has no Change Logs", ErrValidation)
		}
		return View{}, err
	}
	if latest.ID != expectedLatestID {
		return View{}, ErrWorkstreamChanged
	}
	cr, err := q.CreateChangeRequestFromWorkstream(ctx, db.CreateChangeRequestFromWorkstreamParams{
		DocumentID: documentID, BaseRevisionID: w.BaseRevisionID,
		WorkstreamID: uuid.NullUUID{UUID: w.ID, Valid: true}, Title: latest.Title,
		ContentMarkdown: latest.ContentMarkdown, OpenedBy: userID,
	})
	if err != nil {
		return View{}, err
	}
	if _, err := q.SubmitDocumentWorkstream(ctx, db.SubmitDocumentWorkstreamParams{
		ID: w.ID, DocumentID: documentID, OwnerID: userID,
	}); err != nil {
		return View{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, err
	}
	return s.view(ctx, cr, doc), nil
}

func (s *Service) ListChangeLogs(ctx context.Context, userID, changeRequestID uuid.UUID) ([]db.ChangeLog, error) {
	if _, err := s.Get(ctx, userID, changeRequestID); err != nil {
		return nil, err
	}
	return s.Queries.ListChangeLogsForChangeRequest(ctx, changeRequestID)
}

func (s *Service) ChangeLogSpans(ctx context.Context, userID, changeRequestID, changeLogID uuid.UUID) ([]redline.Span, error) {
	view, err := s.Get(ctx, userID, changeRequestID)
	if err != nil {
		return nil, err
	}
	target, err := s.Queries.GetChangeLogForChangeRequest(ctx, db.GetChangeLogForChangeRequestParams{
		ID: changeRequestID, ID_2: changeLogID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	baseContent := ""
	if target.Seq == 1 {
		base, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
			ID: view.CR.BaseRevisionID, DocumentID: view.CR.DocumentID,
		})
		if err != nil {
			return nil, err
		}
		baseContent = base.ContentMarkdown
	} else {
		previous, err := s.Queries.GetPreviousChangeLog(ctx, db.GetPreviousChangeLogParams{
			ID: target.ID, WorkstreamID: target.WorkstreamID,
		})
		if err != nil {
			return nil, err
		}
		baseContent = previous.ContentMarkdown
	}
	return redline.Spans(baseContent, target.ContentMarkdown), nil
}

func (s *Service) Get(ctx context.Context, userID, changeRequestID uuid.UUID) (View, error) {
	cr, err := s.Queries.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	doc, err := s.visibleDoc(ctx, userID, cr.DocumentID)
	if err != nil {
		return View{}, err
	}
	return s.view(ctx, cr, doc), nil
}

func (s *Service) ListForDocument(ctx context.Context, userID, documentID uuid.UUID) ([]View, error) {
	doc, err := s.visibleDoc(ctx, userID, documentID)
	if err != nil {
		return nil, err
	}
	rows, err := s.Queries.ListChangeRequestsForDocument(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]View, 0, len(rows))
	for _, cr := range rows {
		out = append(out, s.view(ctx, cr, doc))
	}
	return out, nil
}
func (s *Service) view(ctx context.Context, cr db.ChangeRequest, doc db.Document) View {
	head := uuid.Nil
	if doc.HeadRevisionID.Valid {
		head = doc.HeadRevisionID.UUID
	}
	return View{
		CR:              cr,
		Document:        doc,
		HeadMatchesBase: head == cr.BaseRevisionID,
	}
}

// MergeOutcome reports what a merge did, so the UI can say "merged as-is"
// versus "merged a conflict resolution".
type MergeOutcome struct {
	View           View
	CreatedRevSeq  int64
	UsedResolution bool
}

// Merge moves main forward with the CR's snapshot, or with the merger's
// resolution when main has drifted. Everything happens in one transaction
// guarded by a per-document advisory lock, so two mergers (or a merge racing
// an import CR) serialize instead of interleaving history writes.
func (s *Service) Merge(ctx context.Context, userID, changeRequestID uuid.UUID, resolvedTitle, resolvedContent *string) (MergeOutcome, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return MergeOutcome{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // commit below owns the outcome
	q := db.New(tx)

	// Every write to this document's history waits here while we work.
	lockDocID := ""
	cr, err := q.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MergeOutcome{}, ErrNotFound
		}
		return MergeOutcome{}, err
	}
	lockDocID = cr.DocumentID.String()
	if err := q.AcquireDocumentMergeLock(ctx, lockDocID); err != nil {
		return MergeOutcome{}, err
	}
	doc, err := q.GetDocumentByID(ctx, cr.DocumentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return MergeOutcome{}, ErrNotFound
		}
		return MergeOutcome{}, err
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyApprove)
	if err != nil {
		return MergeOutcome{}, err
	}
	if !allowed {
		return MergeOutcome{}, permissions.ErrDenied
	}
	if cr.Status != "open" {
		return MergeOutcome{}, ErrNotOpen
	}

	head := uuid.Nil
	if doc.HeadRevisionID.Valid {
		head = doc.HeadRevisionID.UUID
	}
	conflict := head != cr.BaseRevisionID
	if conflict && resolvedContent == nil {
		return MergeOutcome{}, ErrConflict
	}

	// A resolution replaces both title and body only where provided, and is
	// honored even on a clean merge, since an approver who edited reviewed
	// deliberately. Revision authorship stays with the opener: merged_by on
	// the CR records who waved it through.
	finalTitle, finalContent := cr.Title, cr.ContentMarkdown
	if resolvedTitle != nil {
		trimmed := strings.TrimSpace(*resolvedTitle)
		if trimmed == "" {
			return MergeOutcome{}, fmt.Errorf("%w: title is required", ErrValidation)
		}
		finalTitle = trimmed
	}
	if resolvedContent != nil {
		if len(*resolvedContent) > maxContentBytes {
			return MergeOutcome{}, ErrTooLarge
		}
		finalContent = *resolvedContent
	}

	seq, err := q.NextRevisionSeq(ctx, cr.DocumentID)
	if err != nil {
		return MergeOutcome{}, err
	}
	rev, err := q.CreateDocumentRevision(ctx, db.CreateDocumentRevisionParams{
		DocumentID:      cr.DocumentID,
		Seq:             int64(seq),
		Title:           finalTitle,
		ContentMarkdown: finalContent,
		CreatedBy:       cr.OpenedBy,
	})
	if err != nil {
		return MergeOutcome{}, err
	}
	if err := q.SetDocumentHead(ctx, db.SetDocumentHeadParams{
		ID:              cr.DocumentID,
		HeadRevisionID:  uuid.NullUUID{UUID: rev.ID, Valid: true},
		Title:           finalTitle,
		ContentMarkdown: finalContent,
	}); err != nil {
		return MergeOutcome{}, err
	}
	updated, err := q.MarkChangeRequestMerged(ctx, db.MarkChangeRequestMergedParams{
		ID:       cr.ID,
		MergedBy: uuid.NullUUID{UUID: userID, Valid: true},
	})
	if err != nil {
		// The status predicate matched no row: a close slipped in between our
		// read and now. Nothing was committed, so main never moved.
		if errors.Is(err, pgx.ErrNoRows) {
			return MergeOutcome{}, ErrNotOpen
		}
		return MergeOutcome{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return MergeOutcome{}, err
	}
	return MergeOutcome{
		View:           s.view(ctx, updated, doc),
		CreatedRevSeq:  int64(seq),
		UsedResolution: resolvedTitle != nil || resolvedContent != nil,
	}, nil
}

// Close ends an open CR without merging. The author may always withdraw their
// own proposal; ending someone else's takes docs:approve, same power that
// merges.
// Close ends a review without merging and, when the Change Request came from
// a branch, hands that branch back to its author. The two writes share a
// transaction: a closed review whose branch stayed sealed is a document nobody
// can work on again.
func (s *Service) Close(ctx context.Context, userID, changeRequestID uuid.UUID, note string) (View, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return View{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // commit below owns the outcome
	q := db.New(tx)

	cr, err := q.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotFound
		}
		return View{}, err
	}
	doc, err := s.visibleDoc(ctx, userID, cr.DocumentID)
	if err != nil {
		return View{}, err
	}
	if cr.OpenedBy != userID {
		allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyApprove)
		if err != nil {
			return View{}, err
		}
		if !allowed {
			return View{}, permissions.ErrDenied
		}
	}
	if len(note) > maxCommentBytes {
		return View{}, fmt.Errorf("%w: close note too long", ErrValidation)
	}
	updated, err := q.CloseChangeRequest(ctx, db.CloseChangeRequestParams{
		ID:        cr.ID,
		CloseNote: strings.TrimSpace(note),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return View{}, ErrNotOpen
		}
		return View{}, err
	}
	if cr.WorkstreamID.Valid {
		// Already abandoned or somehow active: nothing to hand back, and no
		// reason to fail the close over it.
		if _, err := q.ReopenDocumentWorkstream(ctx, cr.WorkstreamID.UUID); err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return View{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return View{}, err
	}
	return s.view(ctx, updated, doc), nil
}

// SpansForSide redlines the CR's branch against its base ("branch"), or the
// live main against that base ("main"). Both views come from immutable data,
// so a reviewer sees exactly what the author proposed no matter how much
// other work merges in the meantime.
func (s *Service) SpansForSide(ctx context.Context, userID, changeRequestID uuid.UUID, side string) ([]redline.Span, error) {
	if side != "branch" && side != "main" {
		return nil, fmt.Errorf("%w: side must be branch or main", ErrValidation)
	}
	cr, err := s.Queries.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	doc, err := s.visibleDoc(ctx, userID, cr.DocumentID)
	if err != nil {
		return nil, err
	}
	base, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
		ID:         cr.BaseRevisionID,
		DocumentID: cr.DocumentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	target := cr.ContentMarkdown
	if side == "main" {
		target = doc.ContentMarkdown
	}
	return redline.Spans(base.ContentMarkdown, target), nil
}

func (s *Service) AddComment(ctx context.Context, userID, changeRequestID uuid.UUID, parentID *uuid.UUID, body string, anchor []byte) (db.CrComment, error) {
	cr, err := s.Queries.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.CrComment{}, ErrNotFound
		}
		return db.CrComment{}, err
	}
	doc, err := s.visibleDoc(ctx, userID, cr.DocumentID)
	if err != nil {
		return db.CrComment{}, err
	}
	// Discussion belongs to the author and to reviewers; docs:manage_comments
	// holders are moderators and inherit nothing extra about who may speak.
	if cr.OpenedBy != userID {
		allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyReview)
		if err != nil {
			return db.CrComment{}, err
		}
		if !allowed {
			return db.CrComment{}, permissions.ErrDenied
		}
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return db.CrComment{}, fmt.Errorf("%w: comment body is required", ErrValidation)
	}
	if len(body) > maxCommentBytes {
		return db.CrComment{}, fmt.Errorf("%w: comment too long", ErrValidation)
	}
	parent := uuid.NullUUID{}
	if parentID != nil && *parentID != uuid.Nil {
		p, err := s.Queries.GetCRComment(ctx, *parentID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return db.CrComment{}, fmt.Errorf("%w: parent comment not found on this change request", ErrValidation)
			}
			return db.CrComment{}, err
		}
		if p.ChangeRequestID != changeRequestID {
			return db.CrComment{}, fmt.Errorf("%w: parent comment not found on this change request", ErrValidation)
		}
		parent = uuid.NullUUID{UUID: *parentID, Valid: true}
	}
	// Every comment references a passage. A discussion that floats free of the
	// redline cannot be answered by changing the document, which is the only
	// thing a review is for.
	if len(anchor) == 0 {
		return db.CrComment{}, fmt.Errorf("%w: a comment must reference a passage of the redline", ErrValidation)
	}
	// Anchors must be small valid JSON objects; anything else is stored as
	// the empty object, rendering as a general comment.
	storedAnchor := []byte("{}")
	if len(anchor) > 0 {
		if len(anchor) > maxAnchorJSONLen {
			return db.CrComment{}, fmt.Errorf("%w: diff anchor too large", ErrValidation)
		}
		var probe map[string]json.RawMessage
		if json.Unmarshal(anchor, &probe) == nil {
			storedAnchor = anchor
		}
	}
	return s.Queries.CreateCRComment(ctx, db.CreateCRCommentParams{
		ChangeRequestID: changeRequestID,
		ParentID:        parent,
		CreatedBy:       userID,
		Body:            body,
		DiffAnchor:      storedAnchor,
	})
}

func (s *Service) ListComments(ctx context.Context, userID, changeRequestID uuid.UUID) ([]db.CrComment, error) {
	cr, err := s.Queries.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if _, err := s.visibleDoc(ctx, userID, cr.DocumentID); err != nil {
		return nil, err
	}
	return s.Queries.ListCRComments(ctx, changeRequestID)
}

// DeleteComment soft-deletes. Anyone may retract their own words; erasing
// someone else's takes docs:manage_comments, and even then the row survives
// so the thread shows something was removed.
func (s *Service) DeleteComment(ctx context.Context, userID, changeRequestID, commentID uuid.UUID) error {
	comment, err := s.Queries.GetCRComment(ctx, commentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || comment.ChangeRequestID != changeRequestID {
			return ErrNotFound
		}
		return err
	}
	cr, err := s.Queries.GetChangeRequestByID(ctx, changeRequestID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	doc, err := s.visibleDoc(ctx, userID, cr.DocumentID)
	if err != nil {
		return err
	}
	if comment.CreatedBy != userID {
		allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyManageComments)
		if err != nil {
			return err
		}
		if !allowed {
			return permissions.ErrDenied
		}
	}
	return s.Queries.SoftDeleteCRComment(ctx, commentID)
}

// visibleDoc loads a live document and checks the caller can see its project.
// Denied callers get ErrNotFound, matching how documents and projects mask
// cross-tenant existence.
func (s *Service) visibleDoc(ctx context.Context, userID, documentID uuid.UUID) (db.Document, error) {
	doc, err := s.Queries.GetDocumentByID(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Document{}, ErrNotFound
		}
		return db.Document{}, err
	}
	visible, err := s.Checker.CanSeeProject(ctx, userID, doc.ProjectID)
	if err != nil {
		return db.Document{}, err
	}
	if !visible {
		return db.Document{}, permissions.ErrDenied
	}
	return doc, nil
}
