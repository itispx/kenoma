-- +goose Up
CREATE TABLE password_reset_token (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX password_reset_token_token_hash_idx ON password_reset_token (token_hash);
CREATE INDEX password_reset_token_user_id_idx ON password_reset_token (user_id);

-- +goose Down
DROP TABLE password_reset_token;
