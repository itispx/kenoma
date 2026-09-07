-- +goose Up
CREATE TABLE organization_member (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'member')),
    invited_by      UUID REFERENCES user_account (id),
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organization_member_org_user_idx
    ON organization_member (organization_id, user_id);
CREATE INDEX organization_member_user_id_idx ON organization_member (user_id);

-- +goose Down
DROP TABLE organization_member;
