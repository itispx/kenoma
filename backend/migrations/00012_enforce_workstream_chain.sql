-- +goose Up
-- Composite foreign keys make the audit chain self-consistent even for
-- operational writes that do not pass through the application service.
ALTER TABLE document_revision
    ADD CONSTRAINT document_revision_id_document_key UNIQUE (id, document_id);

ALTER TABLE document_workstream
    ADD CONSTRAINT document_workstream_base_document_fkey
    FOREIGN KEY (base_revision_id, document_id)
    REFERENCES document_revision (id, document_id);

ALTER TABLE change_log
    ADD CONSTRAINT change_log_id_workstream_key UNIQUE (id, workstream_id);

ALTER TABLE change_log
    ADD CONSTRAINT change_log_parent_workstream_fkey
    FOREIGN KEY (parent_change_log_id, workstream_id)
    REFERENCES change_log (id, workstream_id);

-- +goose Down
ALTER TABLE change_log DROP CONSTRAINT change_log_parent_workstream_fkey;
ALTER TABLE change_log DROP CONSTRAINT change_log_id_workstream_key;
ALTER TABLE document_workstream DROP CONSTRAINT document_workstream_base_document_fkey;
ALTER TABLE document_revision DROP CONSTRAINT document_revision_id_document_key;
