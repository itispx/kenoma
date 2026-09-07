// Package documents holds document content logic. Like projects, every entry
// point authorizes through permissions.Checker rather than assembling its own
// membership query, so there is one place to audit.
//
// Since versioning landed, a document row is a container plus a mirror of its
// head revision. The content itself is immutable history in document_revision;
// the only way main moves is a merged Change Request (package crs).
package documents

import (
	"context"
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
	ErrValidation           = errors.New("validation failed")
	ErrNotFound             = errors.New("not found")
	ErrTooLarge             = errors.New("content too large")
	ErrInitialVersionExists = errors.New("the first version has already been saved")
)

// maxContentBytes is an abuse guard, not a product limit on document length:
// the JSON decoder materializes the whole body in memory, so an uncapped route
// lets one caller exhaust the process. A megabyte is roughly three hundred
// pages of prose, the same ceiling Google Docs enforces.
const maxContentBytes = 1 << 20

type Service struct {
	Queries db.Querier
	Pool    *pgxpool.Pool
	Checker *permissions.Checker
}

func New(queries db.Querier, pool *pgxpool.Pool, checker *permissions.Checker) *Service {
	return &Service{Queries: queries, Pool: pool, Checker: checker}
}

// Create starts a headless document container. Its browser-local initial draft
// becomes immutable revision 1 only when an editor explicitly saves it.
//
// Create requires docs:edit rather than docs:import, which stays reserved for
// the docx upload path. Whoever may write content may start a blank document.
func (s *Service) Create(ctx context.Context, userID, projectID uuid.UUID, rawTitle string) (db.Document, error) {
	title := strings.TrimSpace(rawTitle)
	if title == "" {
		return db.Document{}, fmt.Errorf("%w: title is required", ErrValidation)
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyEdit)
	if err != nil {
		return db.Document{}, err
	}
	if !allowed {
		return db.Document{}, permissions.ErrDenied
	}
	return s.Queries.CreateDocument(ctx, db.CreateDocumentParams{
		ProjectID: projectID,
		Title:     title,
		CreatedBy: userID,
	})
}

// SaveInitialVersion turns a browser-local initial draft into immutable main.
// The row lock makes the transition one-winner: a competing saver observes the
// new head after waiting and receives ErrInitialVersionExists without writing.
func (s *Service) SaveInitialVersion(ctx context.Context, userID, documentID uuid.UUID, rawTitle, contentMarkdown string) (db.Document, error) {
	title := strings.TrimSpace(rawTitle)
	if title == "" {
		return db.Document{}, fmt.Errorf("%w: title is required", ErrValidation)
	}
	if strings.TrimSpace(contentMarkdown) == "" {
		return db.Document{}, fmt.Errorf("%w: content is required", ErrValidation)
	}
	if len(contentMarkdown) > maxContentBytes {
		return db.Document{}, ErrTooLarge
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return db.Document{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // commit below owns the outcome
	q := db.New(tx)

	doc, err := q.GetDocumentForInitialVersion(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.Document{}, ErrNotFound
		}
		return db.Document{}, err
	}
	allowed, err := permissions.New(q).HasPermission(ctx, userID, doc.ProjectID, permissions.KeyEdit)
	if err != nil {
		return db.Document{}, err
	}
	if !allowed {
		return db.Document{}, permissions.ErrDenied
	}
	if doc.HeadRevisionID.Valid {
		return db.Document{}, ErrInitialVersionExists
	}

	rev, err := q.CreateDocumentRevision(ctx, db.CreateDocumentRevisionParams{
		DocumentID:      doc.ID,
		Seq:             1,
		Title:           title,
		ContentMarkdown: contentMarkdown,
		CreatedBy:       userID,
	})
	if err != nil {
		return db.Document{}, err
	}
	if err := q.SetDocumentHead(ctx, db.SetDocumentHeadParams{
		ID:              doc.ID,
		HeadRevisionID:  uuid.NullUUID{UUID: rev.ID, Valid: true},
		Title:           title,
		ContentMarkdown: contentMarkdown,
	}); err != nil {
		return db.Document{}, err
	}
	doc, err = q.GetDocumentByID(ctx, doc.ID)
	if err != nil {
		return db.Document{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Document{}, err
	}
	return doc, nil
}

// CreateFromImport turns an uploaded docx (already converted to Markdown by
// the caller) into a brand new document whose first revision is that content.
// It requires docs:import; importing replaces main wholesale on a document
// that has no history yet, which is exactly the power docs:import grants.
func (s *Service) CreateFromImport(ctx context.Context, userID, projectID uuid.UUID, rawTitle, contentMarkdown string) (db.Document, error) {
	title := strings.TrimSpace(rawTitle)
	if title == "" {
		return db.Document{}, fmt.Errorf("%w: title is required", ErrValidation)
	}
	// Byte length, not rune count: the cap exists to bound memory.
	if len(contentMarkdown) > maxContentBytes {
		return db.Document{}, ErrTooLarge
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyImport)
	if err != nil {
		return db.Document{}, err
	}
	if !allowed {
		return db.Document{}, permissions.ErrDenied
	}
	return s.createWithHead(ctx, projectID, title, contentMarkdown, userID)
}

func (s *Service) createWithHead(ctx context.Context, projectID uuid.UUID, title, contentMarkdown string, userID uuid.UUID) (db.Document, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return db.Document{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // commit below owns the outcome
	q := db.New(tx)

	doc, err := q.CreateDocument(ctx, db.CreateDocumentParams{
		ProjectID: projectID,
		Title:     title,
		CreatedBy: userID,
	})
	if err != nil {
		return db.Document{}, err
	}
	rev, err := q.CreateDocumentRevision(ctx, db.CreateDocumentRevisionParams{
		DocumentID:      doc.ID,
		Seq:             1,
		Title:           title,
		ContentMarkdown: contentMarkdown,
		CreatedBy:       userID,
	})
	if err != nil {
		return db.Document{}, err
	}
	if err := q.SetDocumentHead(ctx, db.SetDocumentHeadParams{
		ID:              doc.ID,
		HeadRevisionID:  uuid.NullUUID{UUID: rev.ID, Valid: true},
		Title:           title,
		ContentMarkdown: contentMarkdown,
	}); err != nil {
		return db.Document{}, err
	}
	doc, err = q.GetDocumentByID(ctx, doc.ID)
	if err != nil {
		return db.Document{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Document{}, err
	}
	return doc, nil
}

// ListForProject uses the same read gate as opening the project itself: any
// grant, or org admin. Holding docs:edit is not required to read.
func (s *Service) ListForProject(ctx context.Context, userID, projectID uuid.UUID) ([]db.ListDocumentsForProjectRow, error) {
	visible, err := s.Checker.CanSeeProject(ctx, userID, projectID)
	if err != nil {
		return nil, err
	}
	if !visible {
		return nil, permissions.ErrDenied
	}
	return s.Queries.ListDocumentsForProject(ctx, projectID)
}

// ListDeletedForProject returns the project's soft-deleted documents so a
// manager can find and restore something that was taken out. Seeing the
// deleted list is itself a docs:manage act: it names rows the rest of the
// project no longer sees, so the same permission that removes and restores
// documents gates the list.
func (s *Service) ListDeletedForProject(ctx context.Context, userID, projectID uuid.UUID) ([]db.ListDocumentsForProjectRow, error) {
	allowed, err := s.Checker.HasPermission(ctx, userID, projectID, permissions.KeyManage)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, permissions.ErrDenied
	}
	return s.Queries.ListDeletedDocumentsForProject(ctx, projectID)
}

// getVisibleDoc loads a live document and checks the caller can see its
// project at all. Every per-document read path funnels through here, which is
// also why a denied caller gets ErrNotFound either way: the check happens
// before anything about the document is revealed.
func (s *Service) getVisibleDoc(ctx context.Context, userID, documentID uuid.UUID) (db.Document, error) {
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

func (s *Service) Get(ctx context.Context, userID, documentID uuid.UUID) (db.Document, error) {
	return s.getVisibleDoc(ctx, userID, documentID)
}

// ListRevisions returns main's immutable history, newest first, bodies left
// out so the list stays cheap.
func (s *Service) ListRevisions(ctx context.Context, userID, documentID uuid.UUID) ([]db.ListDocumentRevisionsRow, error) {
	if _, err := s.getVisibleDoc(ctx, userID, documentID); err != nil {
		return nil, err
	}
	return s.Queries.ListDocumentRevisions(ctx, documentID)
}

// GetRevision returns one full snapshot from history.
func (s *Service) GetRevision(ctx context.Context, userID, documentID, revisionID uuid.UUID) (db.DocumentRevision, error) {
	if _, err := s.getVisibleDoc(ctx, userID, documentID); err != nil {
		return db.DocumentRevision{}, err
	}
	rev, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
		ID:         revisionID,
		DocumentID: documentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.DocumentRevision{}, ErrNotFound
		}
		return db.DocumentRevision{}, err
	}
	return rev, nil
}

// ExportRevision returns one immutable snapshot for download. Unlike Get,
// which any project member may read, handing a file to the caller is the
// one action docs:export specifically grants, so it is checked separately.
// Any revision on main is fair game: main only ever holds approved snapshots,
// since the draft lives on a branch and reaches main through a merged review.
func (s *Service) ExportRevision(ctx context.Context, userID, documentID, revisionID uuid.UUID) (db.DocumentRevision, error) {
	doc, err := s.getVisibleDoc(ctx, userID, documentID)
	if err != nil {
		return db.DocumentRevision{}, err
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyExport)
	if err != nil {
		return db.DocumentRevision{}, err
	}
	if !allowed {
		return db.DocumentRevision{}, permissions.ErrDenied
	}
	rev, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
		ID:         revisionID,
		DocumentID: documentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.DocumentRevision{}, ErrNotFound
		}
		return db.DocumentRevision{}, err
	}
	return rev, nil
}

// DiffRevisions redlines any two snapshots of the same document against each
// other. Diffs are computed on demand from the immutable pair, never stored,
// so they cannot go stale.
func (s *Service) DiffRevisions(ctx context.Context, userID, documentID, fromRevisionID, toRevisionID uuid.UUID) ([]redline.Span, error) {
	from, err := s.GetRevision(ctx, userID, documentID, fromRevisionID)
	if err != nil {
		return nil, err
	}
	to, err := s.GetRevision(ctx, userID, documentID, toRevisionID)
	if err != nil {
		return nil, err
	}
	return redline.Spans(from.ContentMarkdown, to.ContentMarkdown), nil
}

func (s *Service) SoftDelete(ctx context.Context, userID, documentID uuid.UUID) error {
	doc, err := s.getVisibleDoc(ctx, userID, documentID)
	if err != nil {
		return err
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyManage)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	return s.Queries.SoftDeleteDocument(ctx, documentID)
}

// Restore reads the deleted row to find its project, since the checker needs a
// project to authorize against and a soft-deleted document no longer answers
// the ordinary lookup. Unlike a deleted project, a deleted document under a
// live project is still reachable, so docs:manage is the whole gate.
func (s *Service) Restore(ctx context.Context, userID, documentID uuid.UUID) error {
	doc, err := s.Queries.GetDocumentByIDIncludingDeleted(ctx, documentID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyManage)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	return s.Queries.RestoreDocument(ctx, documentID)
}
