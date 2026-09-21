BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS personal_cloud_message (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    owner_id varchar(100) NOT NULL,
    text text NOT NULL,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE INDEX IF NOT EXISTS ix_personal_cloud_message_owner_created
    ON personal_cloud_message(tenant_id, owner_id, created_at DESC, id DESC)
    WHERE deleted = false;

COMMIT;
