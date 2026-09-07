-- +goose Up
CREATE TABLE project (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    created_by      UUID NOT NULL REFERENCES user_account (id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX project_organization_id_idx
    ON project (organization_id)
    WHERE deleted_at IS NULL;

-- +goose Down
DROP TABLE project;
