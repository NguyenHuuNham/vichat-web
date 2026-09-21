BEGIN;

-- Keep the legacy JSON key readable while moving direct-conversation identity
-- to a column that PostgreSQL can enforce safely.
ALTER TABLE conversation
    ADD COLUMN IF NOT EXISTS direct_key varchar(255);

UPDATE conversation
SET direct_key = properties ->> 'direct_key'
WHERE direct_key IS NULL
  AND properties ? 'direct_key';

CREATE TABLE IF NOT EXISTS chat_media_registry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    conversation_id uuid NOT NULL,
    upload_id varchar(64) NOT NULL,
    uploader_id varchar(100) NOT NULL,
    size bigint NOT NULL,
    content_type varchar(255) NOT NULL,
    state varchar(30) NOT NULL DEFAULT 'PENDING_MESSAGE',
    message_ref varchar(255),
    bound_at bigint,
    expires_at bigint,
    cleanup_attempts integer NOT NULL DEFAULT 0,
    cleanup_next_at bigint,
    cleanup_last_error varchar(255),
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_chat_media_registry_upload UNIQUE (tenant_id, upload_id)
);

CREATE INDEX IF NOT EXISTS ix_chat_media_registry_conversation
    ON chat_media_registry(tenant_id, conversation_id, state);
CREATE INDEX IF NOT EXISTS ix_chat_media_registry_cleanup
    ON chat_media_registry(state, cleanup_next_at)
    WHERE deleted = false;

-- Do not merge or delete duplicate conversations during deployment. Emit a
-- report row for operators and create the unique index only when the existing
-- data is already safe to enforce.
CREATE TABLE IF NOT EXISTS conversation_direct_key_duplicate_report (
    tenant_id varchar(50) NOT NULL,
    direct_key varchar(255) NOT NULL,
    conversation_ids uuid[] NOT NULL,
    detected_at bigint NOT NULL DEFAULT extract(epoch from now())::bigint,
    PRIMARY KEY (tenant_id, direct_key)
);

INSERT INTO conversation_direct_key_duplicate_report (tenant_id, direct_key, conversation_ids)
SELECT tenant_id, direct_key, array_agg(id ORDER BY created_at, id)
FROM conversation
WHERE deleted = false AND direct_key IS NOT NULL AND direct_key <> ''
GROUP BY tenant_id, direct_key
HAVING count(*) > 1
ON CONFLICT (tenant_id, direct_key) DO UPDATE
SET conversation_ids = EXCLUDED.conversation_ids,
    detected_at = EXCLUDED.detected_at;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM conversation_direct_key_duplicate_report) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_active_direct_key
            ON conversation(tenant_id, direct_key)
            WHERE deleted = false AND direct_key IS NOT NULL AND direct_key <> '';
    END IF;
END $$;

ALTER TABLE personal_cloud_file
    ADD COLUMN IF NOT EXISTS cleanup_state varchar(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE personal_cloud_file
    ADD COLUMN IF NOT EXISTS cleanup_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE personal_cloud_file
    ADD COLUMN IF NOT EXISTS cleanup_next_at bigint;
ALTER TABLE personal_cloud_file
    ADD COLUMN IF NOT EXISTS cleanup_last_error varchar(255);
ALTER TABLE chat_media_registry
    ADD COLUMN IF NOT EXISTS message_ref varchar(255);
ALTER TABLE chat_media_registry
    ADD COLUMN IF NOT EXISTS expires_at bigint;
CREATE INDEX IF NOT EXISTS ix_personal_cloud_file_cleanup
    ON personal_cloud_file(cleanup_state, cleanup_next_at)
    WHERE deleted = false;

COMMIT;
