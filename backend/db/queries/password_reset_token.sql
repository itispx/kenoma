-- name: CreatePasswordResetToken :one
INSERT INTO password_reset_token (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: InvalidateUserPasswordResetTokens :exec
UPDATE password_reset_token
SET used_at = now()
WHERE user_id = $1 AND used_at IS NULL;

-- name: GetValidPasswordResetToken :one
SELECT * FROM password_reset_token
WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now();

-- name: MarkPasswordResetTokenUsed :exec
UPDATE password_reset_token
SET used_at = now()
WHERE id = $1;

-- name: DeleteExpiredPasswordResetTokens :execrows
DELETE FROM password_reset_token
WHERE expires_at < $1;
