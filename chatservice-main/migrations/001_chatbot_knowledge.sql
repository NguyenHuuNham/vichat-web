BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS knowledge_base (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    code varchar(100) NOT NULL,
    name varchar(255) NOT NULL,
    description text,
    access_scope varchar(30) NOT NULL DEFAULT 'COMPANY',
    allowed_department_ids jsonb DEFAULT '[]'::jsonb,
    active boolean NOT NULL DEFAULT true,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_knowledge_base_code UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS knowledge_document (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    knowledge_base_id uuid NOT NULL REFERENCES knowledge_base(id),
    title varchar(500) NOT NULL,
    file_name varchar(500),
    mime_type varchar(255),
    source_type varchar(30) NOT NULL DEFAULT 'TEXT',
    source_url text,
    checksum varchar(64),
    version integer NOT NULL DEFAULT 1,
    status varchar(30) NOT NULL DEFAULT 'READY',
    extracted_text text,
    uploaded_by varchar(100),
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE TABLE IF NOT EXISTS knowledge_chunk (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    knowledge_base_id uuid NOT NULL REFERENCES knowledge_base(id),
    document_id uuid NOT NULL REFERENCES knowledge_document(id),
    chunk_index integer NOT NULL,
    page_number integer,
    content text NOT NULL,
    content_search text NOT NULL,
    token_count integer,
    embedding jsonb,
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint,
    CONSTRAINT uq_knowledge_chunk_index UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS chatbot_run (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id varchar(50) NOT NULL,
    conversation_ref varchar(255),
    user_ref varchar(100),
    bot_id uuid,
    provider varchar(100),
    model varchar(100),
    status varchar(30) NOT NULL,
    matched_chunk_ids jsonb DEFAULT '[]'::jsonb,
    prompt_tokens integer,
    completion_tokens integer,
    latency_ms integer,
    error_code varchar(100),
    properties jsonb DEFAULT '{}'::jsonb,
    created_at bigint,
    updated_at bigint,
    deleted boolean DEFAULT false,
    deleted_at bigint
);

CREATE INDEX IF NOT EXISTS ix_knowledge_base_tenant ON knowledge_base(tenant_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_document_tenant_base ON knowledge_document(tenant_id, knowledge_base_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_document_checksum ON knowledge_document(checksum);
CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_tenant_base ON knowledge_chunk(tenant_id, knowledge_base_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_chunk_document ON knowledge_chunk(document_id);
CREATE INDEX IF NOT EXISTS ix_chatbot_run_tenant_created ON chatbot_run(tenant_id, created_at DESC);

COMMIT;
