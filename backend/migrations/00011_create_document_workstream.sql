-- +goose Up
-- A workstream is one named, server-backed line of work for a document: a
-- branch. Change logs are its immutable checkpoints. The branch and its logs
-- are visible to everyone who can see the project; only the owner writes to
-- it, and the uncommitted working copy never leaves the owner's browser.
CREATE TABLE document_workstream (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      UUID NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    owner_id          UUID NOT NULL REFERENCES user_account (id),
    name              TEXT NOT NULL
                      CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
    base_revision_id UUID NOT NULL REFERENCES document_revision (id),
    status            TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'submitted', 'abandoned')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at      TIMESTAMPTZ,
    abandoned_at      TIMESTAMPTZ,
    CHECK (
        (status = 'active' AND submitted_at IS NULL AND abandoned_at IS NULL)
        OR (status = 'submitted' AND submitted_at IS NOT NULL AND abandoned_at IS NULL)
        OR (status = 'abandoned' AND submitted_at IS NULL AND abandoned_at IS NOT NULL)
    )
);

-- A name identifies a branch inside its document, the way a git branch name
-- identifies one inside a repository, so it is unique per document rather
-- than per owner. Submitted branches keep holding their name: their Change
-- Request is still open against it, and reusing the name mid-review would
-- make the reviewer's link ambiguous. An abandoned branch releases it.
CREATE UNIQUE INDEX document_workstream_document_name_key
    ON document_workstream (document_id, lower(btrim(name)))
    WHERE status IN ('active', 'submitted');

CREATE INDEX document_workstream_document_idx
    ON document_workstream (document_id, created_at DESC);

CREATE TABLE change_log (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workstream_id        UUID NOT NULL REFERENCES document_workstream (id) ON DELETE CASCADE,
    seq                  BIGINT NOT NULL CHECK (seq > 0),
    parent_change_log_id UUID REFERENCES change_log (id),
    message              TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 200),
    title                TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
    content_markdown     TEXT NOT NULL,
    created_by           UUID NOT NULL REFERENCES user_account (id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX change_log_workstream_seq_key
    ON change_log (workstream_id, seq);

CREATE INDEX change_log_workstream_created_idx
    ON change_log (workstream_id, created_at);

ALTER TABLE change_request
    ADD COLUMN workstream_id UUID REFERENCES document_workstream (id);

-- One OPEN Change Request per branch, not one ever: closing a review returns
-- the branch to its author, and the next submission from that same branch has
-- to be able to exist alongside the closed one it replaces.
CREATE UNIQUE INDEX change_request_workstream_key
    ON change_request (workstream_id)
    WHERE workstream_id IS NOT NULL AND status = 'open';

-- +goose Down
DROP INDEX change_request_workstream_key;
ALTER TABLE change_request DROP COLUMN workstream_id;
DROP TABLE change_log;
DROP TABLE document_workstream;
