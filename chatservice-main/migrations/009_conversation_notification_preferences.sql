BEGIN;

ALTER TABLE conversation_participant
    ADD COLUMN IF NOT EXISTS notification_muted_until BIGINT;

COMMIT;
