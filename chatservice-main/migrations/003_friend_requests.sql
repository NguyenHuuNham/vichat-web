BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS friend_request (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    requester_id varchar(100) NOT NULL,
    requester_name varchar(255),
    recipient_id varchar(100) NOT NULL,
    recipient_name varchar(255),
    note varchar(500),
    status varchar(20) NOT NULL DEFAULT 'PENDING',
    responder_id varchar(100),
    responder_name varchar(255),
    responded_at bigint,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE INDEX IF NOT EXISTS ix_friend_request_user
    ON friend_request(tenant_id, requester_id, recipient_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_request_active_pair
    ON friend_request(
        tenant_id,
        LEAST(requester_id, recipient_id),
        GREATEST(requester_id, recipient_id)
    )
    WHERE deleted = false AND status IN ('PENDING', 'ACCEPTED');

COMMIT;
