BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS management_tenant (
    id varchar(50) PRIMARY KEY,
    name varchar(255) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at bigint,
    updated_at bigint,
    properties jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS management_account (
    id varchar(100) PRIMARY KEY,
    tenant_id varchar(50) NOT NULL REFERENCES management_tenant(id),
    username varchar(100) NOT NULL,
    email varchar(255),
    password_hash varchar(255) NOT NULL,
    full_name varchar(255) NOT NULL,
    role varchar(50) NOT NULL DEFAULT 'member',
    department varchar(255),
    title varchar(255),
    avatar text,
    tinode_username varchar(100) NOT NULL,
    tinode_uid varchar(100),
    active boolean NOT NULL DEFAULT true,
    created_at bigint,
    updated_at bigint,
    last_login_at bigint,
    properties jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT uq_management_account_username UNIQUE (tenant_id, username),
    CONSTRAINT uq_management_account_email UNIQUE (tenant_id, email)
);

CREATE INDEX IF NOT EXISTS ix_management_account_tenant_active
    ON management_account(tenant_id, active, full_name);

CREATE TABLE IF NOT EXISTS security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50),
    user_id varchar(100),
    event_name varchar(100) NOT NULL,
    success boolean NOT NULL DEFAULT true,
    ip_address varchar(100),
    user_agent varchar(500),
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE INDEX IF NOT EXISTS ix_security_audit_lookup
    ON security_audit_log(tenant_id, event_name, created_at DESC);

INSERT INTO management_tenant(id, name, active, created_at, updated_at, properties)
VALUES ('song-hong', 'SONG HONG', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;
