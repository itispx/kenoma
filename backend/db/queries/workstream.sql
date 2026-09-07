-- name: CreateDocumentWorkstream :one
INSERT INTO document_workstream (document_id, owner_id, name, base_revision_id)
VALUES (
    sqlc.arg(document_id),
    sqlc.arg(owner_id),
    btrim(sqlc.arg(name)),
    sqlc.arg(base_revision_id)
)
RETURNING *;

-- Every branch on the document, whoever owns it: a branch is visible to the
-- whole project, and the caller's project access is checked before this runs.
-- Active first, then most recently touched, so the list opens on live work.
-- name: ListDocumentWorkstreams :many
SELECT
    w.*,
    u.name AS owner_name,
    (SELECT count(*) FROM change_log cl WHERE cl.workstream_id = w.id) AS change_log_count
FROM document_workstream w
JOIN user_account u ON u.id = w.owner_id
WHERE w.document_id = $1
ORDER BY (w.status = 'active') DESC, w.updated_at DESC;

-- Read path: no owner filter. Reading a branch needs project access, which
-- the service checks; writing to one still needs to be its owner.
-- name: GetDocumentWorkstreamForRead :one
SELECT *
FROM document_workstream
WHERE id = $1 AND document_id = $2;

-- name: GetDocumentWorkstreamByID :one
SELECT *
FROM document_workstream
WHERE id = $1 AND document_id = $2 AND owner_id = $3;

-- Locks the active workstream before appending a log or submitting it.
-- name: GetDocumentWorkstreamForUpdate :one
SELECT *
FROM document_workstream
WHERE id = $1 AND document_id = $2 AND owner_id = $3 AND status = 'active'
FOR UPDATE;

-- name: AbandonDocumentWorkstream :one
UPDATE document_workstream
SET status = 'abandoned', abandoned_at = now(), updated_at = now()
WHERE id = $1 AND document_id = $2 AND owner_id = $3 AND status = 'active'
RETURNING *;

-- Closing a Change Request hands the branch back to its author. Scoped to
-- 'submitted' so it can never resurrect an abandoned branch.
-- name: ReopenDocumentWorkstream :one
UPDATE document_workstream
SET status = 'active', submitted_at = NULL, updated_at = now()
WHERE id = $1 AND status = 'submitted'
RETURNING *;

-- name: SubmitDocumentWorkstream :one
UPDATE document_workstream
SET status = 'submitted', submitted_at = now(), updated_at = now()
WHERE id = $1 AND document_id = $2 AND owner_id = $3 AND status = 'active'
RETURNING *;

-- The caller locks the workstream before this statement, serializing sequence
-- assignment and expected-parent validation in the surrounding transaction.
-- name: CreateChangeLog :one
INSERT INTO change_log (
    workstream_id,
    seq,
    parent_change_log_id,
    message,
    title,
    content_markdown,
    created_by
)
SELECT
    $1,
    coalesce(max(seq), 0) + 1,
    $2,
    $3,
    $4,
    $5,
    $6
FROM change_log
WHERE workstream_id = $1
RETURNING *;

-- name: TouchDocumentWorkstream :exec
UPDATE document_workstream
SET updated_at = now()
WHERE id = $1;

-- Saved logs are the published part of a branch, so these read paths join
-- only to prove the log belongs to this document.
-- name: ListChangeLogsForWorkstream :many
SELECT cl.*
FROM change_log cl
JOIN document_workstream w ON w.id = cl.workstream_id
WHERE cl.workstream_id = $1
  AND w.document_id = $2
ORDER BY cl.seq ASC;

-- name: GetChangeLogByID :one
SELECT cl.*
FROM change_log cl
JOIN document_workstream w ON w.id = cl.workstream_id
WHERE cl.id = $1
  AND cl.workstream_id = $2
  AND w.document_id = $3;

-- name: GetLatestChangeLog :one
SELECT cl.*
FROM change_log cl
JOIN document_workstream w ON w.id = cl.workstream_id
WHERE cl.workstream_id = $1
  AND w.document_id = $2
ORDER BY cl.seq DESC
LIMIT 1;

-- Included logs become visible with their Change Request. The caller first
-- authorizes access to the CR, so these queries scope identity to that CR.
-- name: ListChangeLogsForChangeRequest :many
SELECT cl.*
FROM change_log cl
JOIN change_request cr ON cr.workstream_id = cl.workstream_id
WHERE cr.id = $1
ORDER BY cl.seq ASC;

-- name: GetChangeLogForChangeRequest :one
SELECT cl.*
FROM change_log cl
JOIN change_request cr ON cr.workstream_id = cl.workstream_id
WHERE cr.id = $1 AND cl.id = $2;

-- name: GetPreviousChangeLog :one
SELECT previous.*
FROM change_log current
JOIN change_log previous
  ON previous.workstream_id = current.workstream_id
 AND previous.seq = current.seq - 1
WHERE current.id = $1 AND current.workstream_id = $2;
