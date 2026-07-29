BEGIN;

-- Participant rows are authoritative. Remove stale frontend snapshots which
-- may contain expired authentication fields copied from the browser session.
UPDATE conversation
SET properties = COALESCE(properties, '{}'::jsonb) - 'members',
    updated_at = EXTRACT(EPOCH FROM NOW())::bigint
WHERE jsonb_exists(COALESCE(properties, '{}'::jsonb), 'members');

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_participant_identity
    ON conversation_participant(tenant_id, conversation_id, participant_id)
    WHERE deleted = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conversation_tinode_topic_active
    ON conversation(tinode_topic)
    WHERE deleted = false AND tinode_topic IS NOT NULL;

COMMIT;
