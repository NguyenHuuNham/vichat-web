BEGIN;

ALTER TABLE conversation_participant
    ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20);

UPDATE conversation_participant
SET approval_status = 'APPROVED'
WHERE approval_status IS NULL;

ALTER TABLE conversation_participant
    ALTER COLUMN approval_status SET DEFAULT 'APPROVED',
    ALTER COLUMN approval_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS ix_conversation_participant_approval_status
    ON conversation_participant(tenant_id, conversation_id, approval_status)
    WHERE deleted = false;

COMMIT;
