BEGIN;

ALTER TABLE conversation_participant
    ADD COLUMN IF NOT EXISTS blocked_at BIGINT;

CREATE INDEX IF NOT EXISTS ix_management_account_active_tinode_uid
    ON management_account(tinode_uid, tenant_id)
    WHERE tinode_uid IS NOT NULL AND active = true;

CREATE INDEX IF NOT EXISTS ix_conversation_active_direct_key
    ON conversation USING gin (properties jsonb_path_ops)
    WHERE deleted = false AND properties ? 'direct_key';

CREATE INDEX IF NOT EXISTS ix_conversation_participant_blocked_at
    ON conversation_participant(tenant_id, conversation_id, blocked_at)
    WHERE blocked_at IS NOT NULL AND deleted = false;

COMMIT;
