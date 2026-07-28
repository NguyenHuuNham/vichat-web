BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_token (
    id varchar(100) PRIMARY KEY,
    tenant_id varchar(50) NOT NULL REFERENCES management_tenant(id),
    account_id varchar(100) NOT NULL REFERENCES management_account(id) ON DELETE CASCADE,
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at bigint NOT NULL,
    used_at bigint,
    requested_ip varchar(100),
    created_at bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_password_reset_account
    ON password_reset_token(tenant_id, account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_password_reset_active
    ON password_reset_token(token_hash, expires_at)
    WHERE used_at IS NULL;

UPDATE management_account
SET properties = jsonb_set(
    COALESCE(properties, '{}'::jsonb),
    '{auth_version}',
    COALESCE(properties->'auth_version', '0'::jsonb),
    true
);

COMMIT;
