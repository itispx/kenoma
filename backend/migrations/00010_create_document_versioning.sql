-- +goose Up
-- Git-style versioning: immutable main revisions, browser-held working
-- branches that arrive as Change Requests, and CR discussion threads.

CREATE TABLE document_revision (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      UUID NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    -- Monotonic per-document position of this snapshot in main's history.
    -- Assigned as max(seq)+1 inside the merge transaction, which serializes
    -- merges through an advisory lock, so gaps never appear.
    seq              BIGINT NOT NULL,
    title            TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    created_by       UUID NOT NULL REFERENCES user_account (id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX document_revision_doc_seq_key
    ON document_revision (document_id, seq);

ALTER TABLE document
    ADD COLUMN head_revision_id UUID REFERENCES document_revision (id);

-- Every document that exists today becomes revision 1 of its own history, so
-- pre-versioning content is exactly what main pointed at when this ships.
INSERT INTO document_revision (document_id, seq, title, content_markdown, created_by, created_at)
SELECT id, 1, title, content_markdown, created_by, created_at
FROM document;

UPDATE document d
SET head_revision_id = r.id
FROM document_revision r
WHERE r.document_id = d.id AND r.seq = 1;

CREATE TABLE change_request (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id      UUID NOT NULL REFERENCES document (id) ON DELETE CASCADE,
    base_revision_id UUID NOT NULL REFERENCES document_revision (id),
    -- 'edit' came from a browser branch; 'import' from a docx upload.
    kind             TEXT NOT NULL DEFAULT 'edit' CHECK (kind IN ('edit', 'import')),
    title            TEXT NOT NULL,
    content_markdown TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'closed')),
    opened_by        UUID NOT NULL REFERENCES user_account (id),
    merged_by        UUID REFERENCES user_account (id),
    close_note       TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at        TIMESTAMPTZ
);

CREATE INDEX change_request_document_idx
    ON change_request (document_id, status);

CREATE TABLE cr_comment (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    change_request_id UUID NOT NULL REFERENCES change_request (id) ON DELETE CASCADE,
    -- Threads attach to another comment on the same CR; one level is enough
    -- for review discussion and keeps rendering simple.
    parent_id         UUID REFERENCES cr_comment (id) ON DELETE CASCADE,
    created_by        UUID NOT NULL REFERENCES user_account (id),
    body              TEXT NOT NULL,
    -- Where on the base->branch redline this comment sits:
    -- {"op_index": N, "context_hash": "..."}. Empty object means a general
    -- (not inline-anchored) comment.
    diff_anchor       JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Moderation via docs:manage_comments soft-deletes rather than destroys,
    -- so a moderated thread still shows that something was removed.
    deleted_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX cr_comment_cr_idx
    ON cr_comment (change_request_id, created_at);

-- +goose Down
DROP TABLE cr_comment;
DROP TABLE change_request;
ALTER TABLE document DROP COLUMN IF EXISTS head_revision_id;
DROP TABLE document_revision;
