BEGIN;

-- Older local volumes may contain an earlier version of the management tables.
-- Keep the migration rerunnable while bringing those volumes to the current model.
ALTER TABLE IF EXISTS management_tenant
    ADD COLUMN IF NOT EXISTS name varchar(255),
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at bigint,
    ADD COLUMN IF NOT EXISTS updated_at bigint,
    ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS management_account
    ADD COLUMN IF NOT EXISTS tenant_id varchar(50),
    ADD COLUMN IF NOT EXISTS username varchar(100),
    ADD COLUMN IF NOT EXISTS email varchar(255),
    ADD COLUMN IF NOT EXISTS password_hash varchar(255),
    ADD COLUMN IF NOT EXISTS full_name varchar(255),
    ADD COLUMN IF NOT EXISTS role varchar(50) DEFAULT 'member',
    ADD COLUMN IF NOT EXISTS department varchar(255),
    ADD COLUMN IF NOT EXISTS title varchar(255),
    ADD COLUMN IF NOT EXISTS avatar text,
    ADD COLUMN IF NOT EXISTS tinode_username varchar(100),
    ADD COLUMN IF NOT EXISTS tinode_uid varchar(100),
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS created_at bigint,
    ADD COLUMN IF NOT EXISTS updated_at bigint,
    ADD COLUMN IF NOT EXISTS last_login_at bigint,
    ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS security_audit_log
    ADD COLUMN IF NOT EXISTS tenant_id varchar(50),
    ADD COLUMN IF NOT EXISTS user_id varchar(100),
    ADD COLUMN IF NOT EXISTS event_name varchar(100),
    ADD COLUMN IF NOT EXISTS success boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS ip_address varchar(100),
    ADD COLUMN IF NOT EXISTS user_agent varchar(500),
    ADD COLUMN IF NOT EXISTS properties jsonb DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at bigint,
    ADD COLUMN IF NOT EXISTS updated_at bigint,
    ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS deleted_at bigint;

UPDATE management_tenant SET name = COALESCE(name, id) WHERE name IS NULL;
UPDATE management_account
SET
    tenant_id = COALESCE(tenant_id, 'song-hong'),
    username = COALESCE(username, id),
    full_name = COALESCE(full_name, username, id),
    role = COALESCE(role, 'member'),
    tinode_username = COALESCE(tinode_username, username),
    properties = COALESCE(properties, '{}'::jsonb);
UPDATE security_audit_log SET event_name = COALESCE(event_name, 'MIGRATION'), properties = COALESCE(properties, '{}'::jsonb);

CREATE INDEX IF NOT EXISTS ix_management_account_tenant_active
    ON management_account(tenant_id, active, full_name);
CREATE INDEX IF NOT EXISTS ix_security_audit_lookup
    ON security_audit_log(tenant_id, event_name, created_at DESC);

COMMIT;
