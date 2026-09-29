BEGIN;

ALTER TABLE conversation
    ADD COLUMN IF NOT EXISTS creation_request_id VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_active_creation_request
    ON conversation(tenant_id, creation_request_id)
    WHERE deleted = false AND creation_request_id IS NOT NULL;

COMMIT;
