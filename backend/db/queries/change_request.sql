-- Serializes merges of one document: every transaction that moves main takes
-- this lock first. hashtextextended maps the UUID to a bigint key space.
-- name: AcquireDocumentMergeLock :exec
SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0));

-- name: CreateChangeRequest :one
INSERT INTO change_request (document_id, base_revision_id, kind, title, content_markdown, opened_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateChangeRequestFromWorkstream :one
INSERT INTO change_request (
    document_id, base_revision_id, workstream_id, kind,
    title, content_markdown, opened_by
)
VALUES ($1, $2, $3, 'edit', $4, $5, $6)
RETURNING *;

-- name: GetChangeRequestByID :one
SELECT * FROM change_request
WHERE id = $1;

-- Open CRs are what review pages care about; merged and closed ones are
-- history the document page lists in full and lets callers group by status.
-- name: ListChangeRequestsForDocument :many
SELECT *
FROM change_request
WHERE document_id = $1
ORDER BY created_at DESC;

-- The status predicate makes "merge" and "close" race-safe without a lock:
-- whichever statement runs second matches no row and reports the conflict.
-- name: MarkChangeRequestMerged :one
UPDATE change_request
SET status = 'merged',
    merged_by = $2,
    updated_at = now()
WHERE id = $1 AND status = 'open'
RETURNING *;

-- name: CloseChangeRequest :one
UPDATE change_request
SET status = 'closed',
    close_note = $2,
    closed_at = now(),
    updated_at = now()
WHERE id = $1 AND status = 'open'
RETURNING *;

-- name: CreateCRComment :one
INSERT INTO cr_comment (change_request_id, parent_id, created_by, body, diff_anchor)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListCRComments :many
SELECT *
FROM cr_comment
WHERE change_request_id = $1 AND deleted_at IS NULL
ORDER BY created_at ASC;

-- name: GetCRComment :one
SELECT *
FROM cr_comment
WHERE id = $1 AND deleted_at IS NULL;

-- name: SoftDeleteCRComment :exec
UPDATE cr_comment
SET deleted_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- The project page's review queue: every open proposal across the project's
-- documents, newest activity first. The document title rides along so the list
-- reads without a second fetch, and the snapshot body stays off the list shape.
-- name: ListOpenChangeRequestsForProject :many
SELECT cr.id, cr.document_id, d.title AS document_title, cr.base_revision_id,
       cr.kind, cr.title, cr.status, cr.opened_by, cr.created_at, cr.updated_at,
       cr.workstream_id
FROM change_request cr
JOIN document d ON d.id = cr.document_id
WHERE d.project_id = $1 AND cr.status = 'open'
ORDER BY cr.updated_at DESC;
