-- +goose Up
CREATE TABLE permission (
    key         TEXT PRIMARY KEY,
    description TEXT NOT NULL
);

INSERT INTO permission (key, description) VALUES
    ('docs:import',          'Upload a docx'),
    ('docs:edit',            'Edit draft content and autosave'),
    ('docs:submit_review',   'Lock a draft and send it to review'),
    ('docs:review',          'Comment on or request changes to an in-review revision'),
    ('docs:approve',         'Approve or reject an in-review revision'),
    ('docs:export',          'Export an approved revision as docx or PDF'),
    ('docs:manage_comments', 'Resolve or delete other people''s comments'),
    ('docs:manage',          'Administer this project: rename, delete, and grant or revoke permissions');

CREATE TABLE project_permission_grant (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID NOT NULL REFERENCES project (id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES user_account (id) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permission (key),
    granted_by     UUID NOT NULL REFERENCES user_account (id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX project_permission_grant_unique_idx
    ON project_permission_grant (project_id, user_id, permission_key);

-- +goose Down
DROP TABLE project_permission_grant;
DROP TABLE permission;
