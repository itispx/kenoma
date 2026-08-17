-- name: CreateUser :one
INSERT INTO user_account (email, password_hash, name)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetUserByEmail :one
SELECT * FROM user_account
WHERE lower(email) = lower($1);

-- name: GetUserByID :one
SELECT * FROM user_account
WHERE id = $1;

-- name: UpdateUserPassword :exec
UPDATE user_account
SET password_hash = $2, updated_at = now()
WHERE id = $1;
