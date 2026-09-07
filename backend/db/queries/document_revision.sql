-- name: CreateDocumentRevision :one
INSERT INTO document_revision (document_id, seq, title, content_markdown, created_by)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- Called inside the merge transaction, after the per-document advisory lock,
-- so concurrent merges of the same document serialize here rather than race.
-- name: NextRevisionSeq :one
SELECT coalesce(max(seq), 0) + 1 AS seq
FROM document_revision
WHERE document_id = $1;

-- The body is deliberately left out: history lists render titles only, and a
-- long document's full text per row would dwarf every other page's payload.
-- name: ListDocumentRevisions :many
SELECT id, document_id, seq, title, created_by, created_at
FROM document_revision
WHERE document_id = $1
ORDER BY seq DESC;

-- name: GetDocumentRevision :one
SELECT * FROM document_revision
WHERE id = $1 AND document_id = $2;

-- Moves main forward. The document row's title and content_markdown are kept
-- as an exact mirror of the head revision so the existing single-row reads
-- (list pages, GET document) never need a join.
-- name: SetDocumentHead :exec
UPDATE document
SET head_revision_id = $2,
    title = $3,
    content_markdown = $4,
    updated_at = now()
WHERE id = $1;
