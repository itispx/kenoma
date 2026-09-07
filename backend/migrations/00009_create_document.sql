-- +goose Up
CREATE TABLE document (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    content_markdown TEXT NOT NULL DEFAULT '',
    created_by       UUID NOT NULL REFERENCES user_account (id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at       TIMESTAMPTZ
);

CREATE INDEX document_project_id_idx
    ON document (project_id)
    WHERE deleted_at IS NULL;

-- +goose Down
DROP TABLE document;
