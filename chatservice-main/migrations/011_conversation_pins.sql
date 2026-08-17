BEGIN;

ALTER TABLE conversation_participant
    ADD COLUMN IF NOT EXISTS pinned_at BIGINT;

COMMIT;
