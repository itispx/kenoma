-- name: ListPermissions :many
SELECT * FROM permission
ORDER BY key;

-- The whole authorization model in one query: an org admin passes on any key
-- for any project in their org, anyone else passes only with a matching grant.
-- name: UserHasProjectPermission :one
SELECT EXISTS (
    SELECT 1
    FROM project p
    WHERE p.id = $1
      AND p.deleted_at IS NULL
      AND (
        EXISTS (
          SELECT 1 FROM organization_member m
          WHERE m.organization_id = p.organization_id
            AND m.user_id = $2
            AND m.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM project_permission_grant g
          WHERE g.project_id = p.id
            AND g.user_id = $2
            AND g.permission_key = $3
        )
      )
) AS allowed;

-- name: ListUserPermissionKeysForProject :many
SELECT permission_key FROM project_permission_grant
WHERE project_id = $1 AND user_id = $2
ORDER BY permission_key;

-- name: CreateProjectPermissionGrant :one
INSERT INTO project_permission_grant (project_id, user_id, permission_key, granted_by)
VALUES ($1, $2, $3, $4)
ON CONFLICT (project_id, user_id, permission_key) DO NOTHING
RETURNING *;

-- name: ListProjectPermissionGrants :many
SELECT g.*, u.email, u.name AS user_name
FROM project_permission_grant g
JOIN user_account u ON u.id = g.user_id
WHERE g.project_id = $1
ORDER BY u.email, g.permission_key;

-- name: DeleteProjectPermissionGrant :exec
DELETE FROM project_permission_grant
WHERE project_id = $1 AND user_id = $2 AND permission_key = $3;

-- Used when a member is removed from an org: their grants on that org's
-- projects go with them, so removal actually removes access.
-- name: DeleteUserGrantsInOrganization :execrows
DELETE FROM project_permission_grant g
USING project p
WHERE g.project_id = p.id
  AND p.organization_id = $1
  AND g.user_id = $2;
