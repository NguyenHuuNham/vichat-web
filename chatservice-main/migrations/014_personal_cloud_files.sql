BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS personal_cloud_file (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    owner_id varchar(100) NOT NULL,
    upload_id varchar(64) NOT NULL,
    file_name varchar(500) NOT NULL,
    mime_type varchar(255) NOT NULL,
    size bigint NOT NULL,
    media_ref text NOT NULL,
    etag varchar(255),
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_personal_cloud_file_upload UNIQUE (tenant_id, upload_id)
);

CREATE INDEX IF NOT EXISTS ix_personal_cloud_file_owner_updated
    ON personal_cloud_file(tenant_id, owner_id, updated_at DESC)
    WHERE deleted = false;

COMMIT;
