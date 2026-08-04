BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS enterprise_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    item_type varchar(30) NOT NULL,
    title varchar(500) NOT NULL,
    description text,
    status varchar(30) NOT NULL,
    priority varchar(20) NOT NULL DEFAULT 'NORMAL',
    visibility varchar(20) NOT NULL DEFAULT 'COMPANY',
    created_by varchar(100) NOT NULL,
    owner_id varchar(100),
    conversation_id uuid,
    source_message_ref varchar(255),
    due_at bigint,
    starts_at bigint,
    ends_at bigint,
    published_at bigint,
    closed_at bigint,
    version integer NOT NULL DEFAULT 1,
    search_text text NOT NULL DEFAULT '',
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE TABLE IF NOT EXISTS enterprise_item_participant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    item_id uuid NOT NULL REFERENCES enterprise_item(id) ON DELETE CASCADE,
    account_id varchar(100) NOT NULL,
    role varchar(30) NOT NULL,
    state varchar(30) NOT NULL DEFAULT 'PENDING',
    responded_at bigint,
    acknowledged_at bigint,
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE TABLE IF NOT EXISTS enterprise_activity (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    item_id uuid NOT NULL REFERENCES enterprise_item(id) ON DELETE CASCADE,
    actor_id varchar(100) NOT NULL,
    action varchar(50) NOT NULL,
    from_status varchar(30),
    to_status varchar(30),
    comment text,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE INDEX IF NOT EXISTS ix_enterprise_item_tenant_type_updated
    ON enterprise_item(tenant_id, item_type, updated_at DESC)
    WHERE deleted = false;
CREATE INDEX IF NOT EXISTS ix_enterprise_item_tenant_status_due
    ON enterprise_item(tenant_id, status, due_at)
    WHERE deleted = false;
CREATE INDEX IF NOT EXISTS ix_enterprise_item_search
    ON enterprise_item USING gin (to_tsvector('simple', search_text))
    WHERE deleted = false;
CREATE INDEX IF NOT EXISTS ix_enterprise_participant_account
    ON enterprise_item_participant(tenant_id, account_id, item_id)
    WHERE deleted = false;
CREATE UNIQUE INDEX IF NOT EXISTS uq_enterprise_item_participant_active
    ON enterprise_item_participant(tenant_id, item_id, account_id, role)
    WHERE deleted = false;
CREATE INDEX IF NOT EXISTS ix_enterprise_activity_item_created
    ON enterprise_activity(tenant_id, item_id, created_at DESC)
    WHERE deleted = false;

COMMIT;
