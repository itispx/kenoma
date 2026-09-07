-- +goose Up
CREATE TABLE organization (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT NOT NULL,
    is_personal        BOOLEAN NOT NULL DEFAULT false,
    members_can_invite BOOLEAN NOT NULL DEFAULT false,
    created_by         UUID NOT NULL REFERENCES user_account (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ
);

CREATE UNIQUE INDEX organization_one_personal_per_user_idx
    ON organization (created_by)
    WHERE is_personal;

-- +goose Down
DROP TABLE organization;
