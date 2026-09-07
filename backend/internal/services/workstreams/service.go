// Package workstreams owns named branches and their server-backed editing
// checkpoints. A branch and its Change Logs are visible to everyone who can
// see the project; only its owner writes to it, and the mutable working copy
// never leaves that owner's browser.
package workstreams

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	db "github.com/kenoma/backend/db/sqlc"
	"github.com/kenoma/backend/internal/redline"
	"github.com/kenoma/backend/internal/services/permissions"
)

var (
	ErrValidation = errors.New("validation failed")
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("workstream changed")
	ErrTooLarge   = errors.New("content too large")
	ErrNameTaken  = errors.New("branch name already in use")
	ErrNotOwner   = errors.New("not the branch owner")
)

const (
	maxContentBytes = 1 << 20
	maxMessageRunes = 200
	maxNameRunes    = 80
)

type Service struct {
	Queries db.Querier
	Pool    *pgxpool.Pool
	Checker *permissions.Checker
}

type Detail struct {
	Workstream db.DocumentWorkstream
	Logs       []db.ChangeLog
}

// Summary is one row of the branch list: enough to choose a branch without
// loading every log body behind it.
type Summary struct {
	Workstream     db.DocumentWorkstream
	OwnerName      string
	ChangeLogCount int64
}

type AppendParams struct {
	ExpectedParentID *uuid.UUID
	Message          string
	Title            string
	ContentMarkdown  string
}

func New(queries db.Querier, pool *pgxpool.Pool, checker *permissions.Checker) *Service {
	return &Service{Queries: queries, Pool: pool, Checker: checker}
}

func (s *Service) visibleDocument(ctx context.Context, userID, documentID uuid.UUID) (db.Document, error) {
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

func (s *Service) requireEdit(ctx context.Context, userID uuid.UUID, doc db.Document) error {
	allowed, err := s.Checker.HasPermission(ctx, userID, doc.ProjectID, permissions.KeyEdit)
	if err != nil {
		return err
	}
	if !allowed {
		return permissions.ErrDenied
	}
	return nil
}

// Create starts a named branch. An explicit base supports browser drafts that
// began before main moved, while still validating that the revision belongs
// to this document.
func (s *Service) Create(ctx context.Context, userID, documentID uuid.UUID, name string, baseID *uuid.UUID) (Detail, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > maxNameRunes {
		return Detail{}, fmt.Errorf("%w: branch name must be between 1 and 80 characters", ErrValidation)
	}
	doc, err := s.visibleDocument(ctx, userID, documentID)
	if err != nil {
		return Detail{}, err
	}
	if err := s.requireEdit(ctx, userID, doc); err != nil {
		return Detail{}, err
	}
	base := uuid.Nil
	if baseID != nil {
		base = *baseID
	} else if doc.HeadRevisionID.Valid {
		base = doc.HeadRevisionID.UUID
	}
	if base == uuid.Nil {
		return Detail{}, fmt.Errorf("%w: document has no saved version", ErrValidation)
	}
	if _, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{ID: base, DocumentID: documentID}); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Detail{}, fmt.Errorf("%w: base revision does not belong to this document", ErrValidation)
		}
		return Detail{}, err
	}
	w, err := s.Queries.CreateDocumentWorkstream(ctx, db.CreateDocumentWorkstreamParams{
		DocumentID: documentID, OwnerID: userID, Name: name, BaseRevisionID: base,
	})
	if err != nil {
		// The name index is the only unique constraint this insert can trip,
		// and losing that race is the caller's to fix, not an internal error.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Detail{}, ErrNameTaken
		}
		return Detail{}, err
	}
	return Detail{Workstream: w, Logs: []db.ChangeLog{}}, nil
}

// List returns every branch on the document, whoever owns it.
func (s *Service) List(ctx context.Context, userID, documentID uuid.UUID) ([]Summary, error) {
	if _, err := s.visibleDocument(ctx, userID, documentID); err != nil {
		return nil, err
	}
	rows, err := s.Queries.ListDocumentWorkstreams(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(rows))
	for _, row := range rows {
		out = append(out, Summary{
			Workstream: db.DocumentWorkstream{
				ID: row.ID, DocumentID: row.DocumentID, OwnerID: row.OwnerID,
				Name: row.Name, BaseRevisionID: row.BaseRevisionID, Status: row.Status,
				CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
				SubmittedAt: row.SubmittedAt, AbandonedAt: row.AbandonedAt,
			},
			OwnerName:      row.OwnerName,
			ChangeLogCount: row.ChangeLogCount,
		})
	}
	return out, nil
}

// Get returns one branch with its logs. Reading needs project access only:
// saved logs are the published part of a branch.
func (s *Service) Get(ctx context.Context, userID, documentID, workstreamID uuid.UUID) (Detail, error) {
	if _, err := s.visibleDocument(ctx, userID, documentID); err != nil {
		return Detail{}, err
	}
	w, err := s.Queries.GetDocumentWorkstreamForRead(ctx, db.GetDocumentWorkstreamForReadParams{
		ID: workstreamID, DocumentID: documentID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Detail{}, ErrNotFound
		}
		return Detail{}, err
	}
	logs, err := s.Queries.ListChangeLogsForWorkstream(ctx, db.ListChangeLogsForWorkstreamParams{
		WorkstreamID: w.ID, DocumentID: documentID,
	})
	if err != nil {
		return Detail{}, err
	}
	return Detail{Workstream: w, Logs: logs}, nil
}

func (s *Service) Append(ctx context.Context, userID, documentID, workstreamID uuid.UUID, p AppendParams) (db.ChangeLog, error) {
	message := strings.TrimSpace(p.Message)
	title := strings.TrimSpace(p.Title)
	if message == "" || len([]rune(message)) > maxMessageRunes {
		return db.ChangeLog{}, fmt.Errorf("%w: message must be between 1 and 200 characters", ErrValidation)
	}
	if title == "" {
		return db.ChangeLog{}, fmt.Errorf("%w: title is required", ErrValidation)
	}
	if len(p.ContentMarkdown) > maxContentBytes {
		return db.ChangeLog{}, ErrTooLarge
	}
	doc, err := s.visibleDocument(ctx, userID, documentID)
	if err != nil {
		return db.ChangeLog{}, err
	}
	if err := s.requireEdit(ctx, userID, doc); err != nil {
		return db.ChangeLog{}, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return db.ChangeLog{}, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	q := db.New(tx)
	w, err := q.GetDocumentWorkstreamForUpdate(ctx, db.GetDocumentWorkstreamForUpdateParams{
		ID: workstreamID, DocumentID: documentID, OwnerID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return db.ChangeLog{}, ErrNotFound
		}
		return db.ChangeLog{}, err
	}
	latest, latestErr := q.GetLatestChangeLog(ctx, db.GetLatestChangeLogParams{
		WorkstreamID: w.ID, DocumentID: documentID,
	})
	if latestErr != nil && !errors.Is(latestErr, pgx.ErrNoRows) {
		return db.ChangeLog{}, latestErr
	}
	if errors.Is(latestErr, pgx.ErrNoRows) {
		if p.ExpectedParentID != nil {
			return db.ChangeLog{}, ErrConflict
		}
		base, err := q.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{ID: w.BaseRevisionID, DocumentID: documentID})
		if err != nil {
			return db.ChangeLog{}, err
		}
		if base.Title == title && base.ContentMarkdown == p.ContentMarkdown {
			return db.ChangeLog{}, fmt.Errorf("%w: change log must contain a document change", ErrValidation)
		}
	} else {
		if p.ExpectedParentID == nil || *p.ExpectedParentID != latest.ID {
			return db.ChangeLog{}, ErrConflict
		}
		if latest.Title == title && latest.ContentMarkdown == p.ContentMarkdown {
			return db.ChangeLog{}, fmt.Errorf("%w: change log must contain a document change", ErrValidation)
		}
	}
	parent := uuid.NullUUID{}
	if p.ExpectedParentID != nil {
		parent = uuid.NullUUID{UUID: *p.ExpectedParentID, Valid: true}
	}
	created, err := q.CreateChangeLog(ctx, db.CreateChangeLogParams{
		WorkstreamID: w.ID, ParentChangeLogID: parent, Message: message,
		Title: title, ContentMarkdown: p.ContentMarkdown, CreatedBy: userID,
	})
	if err != nil {
		return db.ChangeLog{}, err
	}
	if err := q.TouchDocumentWorkstream(ctx, w.ID); err != nil {
		return db.ChangeLog{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.ChangeLog{}, err
	}
	return created, nil
}

func (s *Service) Abandon(ctx context.Context, userID, documentID, workstreamID uuid.UUID) error {
	doc, err := s.visibleDocument(ctx, userID, documentID)
	if err != nil {
		return err
	}
	if err := s.requireEdit(ctx, userID, doc); err != nil {
		return err
	}
	_, err = s.Queries.AbandonDocumentWorkstream(ctx, db.AbandonDocumentWorkstreamParams{
		ID: workstreamID, DocumentID: documentID, OwnerID: userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// Diff returns the aggregate base-to-latest redline, or one log against its
// direct predecessor when logID is supplied.
func (s *Service) Diff(ctx context.Context, userID, documentID, workstreamID uuid.UUID, logID *uuid.UUID) ([]redline.Span, error) {
	detail, err := s.Get(ctx, userID, documentID, workstreamID)
	if err != nil {
		return nil, err
	}
	if len(detail.Logs) == 0 {
		return nil, ErrNotFound
	}
	targetIndex := len(detail.Logs) - 1
	if logID != nil {
		targetIndex = -1
		for i := range detail.Logs {
			if detail.Logs[i].ID == *logID {
				targetIndex = i
				break
			}
		}
		if targetIndex < 0 {
			return nil, ErrNotFound
		}
	}
	target := detail.Logs[targetIndex]
	baseContent := ""
	if targetIndex == 0 || logID == nil {
		base, err := s.Queries.GetDocumentRevision(ctx, db.GetDocumentRevisionParams{
			ID: detail.Workstream.BaseRevisionID, DocumentID: documentID,
		})
		if err != nil {
			return nil, err
		}
		baseContent = base.ContentMarkdown
	} else {
		baseContent = detail.Logs[targetIndex-1].ContentMarkdown
	}
	return redline.Spans(baseContent, target.ContentMarkdown), nil
}

func (s *Service) ReconcileDiff(ctx context.Context, userID, documentID, workstreamID uuid.UUID, localContent string) ([]redline.Span, error) {
	if len(localContent) > maxContentBytes {
		return nil, ErrTooLarge
	}
	// Reconciliation compares the server's latest checkpoint with a draft that
	// only ever existed in the caller's browser, so this one stays owner-only
	// even though reading the branch itself is open to the project.
	detail, err := s.Get(ctx, userID, documentID, workstreamID)
	if err != nil {
		return nil, err
	}
	if detail.Workstream.OwnerID != userID {
		return nil, ErrNotOwner
	}
	if len(detail.Logs) == 0 {
		return nil, ErrNotFound
	}
	latest := detail.Logs[len(detail.Logs)-1]
	return redline.Spans(latest.ContentMarkdown, localContent), nil
}
