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

INSERT INTO management_account(
    id, tenant_id, username, email, password_hash, full_name, role,
    department, title, avatar, tinode_username, active, created_at, updated_at, properties
)
VALUES
    ('usr-mai-thanh-lam', 'song-hong', 'admin', 'admin@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Mai Thanh Lam', 'admin', 'Ban dieu hanh', 'Quan tri vien', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100&q=80', 'admin', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb),
    ('usr-nguyen-van-tuan', 'song-hong', 'tuan', 'tuan@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Nguyen Van Tuan', 'member', 'Phong Dieu hanh', 'Truong phong Dieu hanh', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&h=100&q=80', 'tuan', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb),
    ('usr-nguyen-thi-lan', 'song-hong', 'lan', 'lan@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Nguyen Thi Lan', 'member', 'Phong Dieu hanh', 'Pho phong Dieu hanh', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&h=100&q=80', 'lan', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb),
    ('usr-pham-thi-huong', 'song-hong', 'huong', 'huong@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Pham Thi Huong', 'member', 'Phong HCNS', 'Truong phong HCNS', 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=100&h=100&q=80', 'huong', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb),
    ('usr-le-quoc-bao', 'song-hong', 'bao', 'bao@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Le Quoc Bao', 'member', 'Phong Ke toan', 'Ke toan truong', 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=100&h=100&q=80', 'bao', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb),
    ('usr-do-minh-quan', 'song-hong', 'quan', 'quan@vichat.vn', crypt('123456', gen_salt('bf', 12)), 'Do Minh Quan', 'member', 'Phong Kinh doanh', 'Truong phong Kinh doanh', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=100&h=100&q=80', 'quan', true, EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;
