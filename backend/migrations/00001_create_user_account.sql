-- +goose Up
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE user_account (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive: signup and login both look email up via lower(email), so
-- Foo@x.com and foo@x.com must not be able to coexist as separate accounts.
CREATE UNIQUE INDEX user_account_email_lower_idx ON user_account (lower(email));

-- +goose Down
DROP TABLE user_account;
