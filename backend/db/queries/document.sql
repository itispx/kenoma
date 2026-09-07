-- name: CreateDocument :one
INSERT INTO document (project_id, title, created_by)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetDocumentByID :one
SELECT * FROM document
WHERE id = $1 AND deleted_at IS NULL;

-- Locks an active document while the first immutable version is created, so
-- two editors cannot both observe an empty head and create revision 1.
-- name: GetDocumentForInitialVersion :one
SELECT * FROM document
WHERE id = $1 AND deleted_at IS NULL
FOR UPDATE;

-- name: GetDocumentByIDIncludingDeleted :one
SELECT * FROM document
WHERE id = $1;

-- The body is deliberately left out: a list of documents would otherwise carry
-- a megabyte of Markdown per row for a page that only renders titles.
-- name: ListDocumentsForProject :many
SELECT id, project_id, title, head_revision_id, created_by, created_at, updated_at, deleted_at
FROM document
WHERE project_id = $1 AND deleted_at IS NULL
ORDER BY updated_at DESC;

-- name: SoftDeleteDocument :exec
UPDATE document
SET deleted_at = now(), updated_at = now()
WHERE id = $1 AND deleted_at IS NULL;

-- name: RestoreDocument :exec
UPDATE document
SET deleted_at = NULL, updated_at = now()
WHERE id = $1;
