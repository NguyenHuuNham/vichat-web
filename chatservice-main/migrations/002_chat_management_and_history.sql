BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS chat_channel (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    code varchar(100) NOT NULL,
    name varchar(255) NOT NULL,
    channel_type varchar(30) NOT NULL,
    provider varchar(100),
    external_id varchar(255),
    external_name varchar(255),
    avatar text,
    icon text,
    webhook_url text,
    webhook_secret text,
    access_token text,
    refresh_token text,
    config jsonb DEFAULT '{}'::jsonb,
    active boolean DEFAULT true,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_chat_channel_code UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS conversation (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    conversation_no varchar(100) UNIQUE,
    channel_id uuid REFERENCES chat_channel(id),
    channel_thread_id varchar(255),
    tinode_topic varchar(255),
    contact_id uuid,
    organization_id uuid,
    subject varchar(500),
    source varchar(30),
    status varchar(30) DEFAULT 'OPEN',
    priority varchar(20) DEFAULT 'NORMAL',
    first_message_at bigint,
    last_message_at bigint,
    closed_at bigint,
    assigned_agent_id uuid,
    assigned_queue_id uuid,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE TABLE IF NOT EXISTS conversation_participant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    conversation_id uuid NOT NULL REFERENCES conversation(id),
    participant_type varchar(30) DEFAULT 'USER',
    participant_id varchar(100) NOT NULL,
    role varchar(30) DEFAULT 'MEMBER',
    joined_at bigint,
    left_at bigint,
    active boolean DEFAULT true,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversation_participant'
          AND column_name = 'participant_id'
          AND udt_name = 'uuid'
    ) THEN
        ALTER TABLE conversation_participant
            ALTER COLUMN participant_id TYPE varchar(100) USING participant_id::text;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS chatbot_message (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    conversation_ref varchar(255) NOT NULL,
    user_ref varchar(100) NOT NULL,
    role varchar(20) NOT NULL,
    content text NOT NULL,
    message_ref varchar(255),
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_chatbot_message_ref UNIQUE (tenant_id, conversation_ref, user_ref, message_ref)
);

CREATE INDEX IF NOT EXISTS ix_conversation_tenant_updated ON conversation(tenant_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ix_conversation_tinode_topic ON conversation(tinode_topic);
CREATE INDEX IF NOT EXISTS ix_conversation_participant_lookup ON conversation_participant(tenant_id, participant_id, active);
CREATE INDEX IF NOT EXISTS ix_chatbot_message_history ON chatbot_message(tenant_id, user_ref, conversation_ref, created_at);

COMMIT;
