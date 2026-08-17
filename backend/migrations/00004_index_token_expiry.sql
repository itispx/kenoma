-- Supports the periodic purge of expired tokens, which filters on expires_at.
-- Without these the purge is a sequential scan of the whole table.
-- +goose Up
CREATE INDEX refresh_token_expires_at_idx ON refresh_token (expires_at);
CREATE INDEX password_reset_token_expires_at_idx ON password_reset_token (expires_at);

-- +goose Down
DROP INDEX password_reset_token_expires_at_idx;
DROP INDEX refresh_token_expires_at_idx;
