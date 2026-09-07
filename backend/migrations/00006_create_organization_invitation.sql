-- +goose Up
CREATE TABLE organization_invitation (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    token_hash      TEXT NOT NULL,
    invited_by      UUID NOT NULL REFERENCES user_account (id),
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organization_invitation_token_hash_idx
    ON organization_invitation (token_hash);

CREATE UNIQUE INDEX organization_invitation_live_idx
    ON organization_invitation (organization_id, lower(email))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- +goose Down
DROP TABLE organization_invitation;
