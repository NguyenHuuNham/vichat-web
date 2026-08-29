from copyreg import constructor
from email.policy import default
from itertools import product
from locale import currency
from operator import index
from sqlalchemy import (
    Column, String, Integer, SmallInteger, BigInteger, DateTime, Date, Boolean, DECIMAL,
    Text, ForeignKey, UniqueConstraint, JSON, Index, Float
)
from sqlalchemy.orm import relationship, backref
# from sqlalchemy.orm.collections import attribute_mapped_collection

from sqlalchemy.orm import *
from application.database import db
from application.database.model import CommonModel
from sqlalchemy.dialects.postgresql import UUID, JSONB
# from application.models.model import User, Role
import uuid
from sqlalchemy import event


class User(CommonModel):
    __tablename__ = 'users'
    # Authentication Attributes.
    user_name = db.Column(String(255), nullable=False, index=True)
    full_name = db.Column(String(255), nullable=True)
    description = db.Column(String(255), nullable=True)
    email = db.Column(String(), index=True)
    phone = db.Column(String(), index=True)
    # password = db.Column(String(255), nullable=False)
    # salt = db.Column(String(255), nullable=False)
    is_active = db.Column(Boolean, default=True)


class OrganizationUnit(CommonModel):
    __tablename__ = "organization_unit"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    parent_id = db.Column(UUID(as_uuid=True), ForeignKey("organization_unit.id"), index=True)
    code = db.Column(String(100), nullable=False)
    name = db.Column(String(255), nullable=False)
    unit_type = db.Column(String(50))
    path = db.Column(String(1000))
    is_active = db.Column(Boolean(), default=True)
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_organization_unit_code"),
    )


class UserOrganization(CommonModel):
    __tablename__ = "user_organization"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=False, index=True)
    organization_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("organization_unit.id"),
        nullable=False,
        index=True,
    )
    role = db.Column(String(100))
    is_primary = db.Column(Boolean(), default=False)
    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "organization_id", name="uq_user_organization"),
    )


# ChatChannel
# Đại diện cho kết nối tới Zalo OA, Facebook Page, Livechat, Telegram...
class ChatChannel(CommonModel):
    __tablename__ = "chat_channel"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    code = db.Column(String(100), nullable=False)
    name = db.Column(String(255), nullable=False)
    channel_type = db.Column(String(30), nullable=False, index=True)
    # zalo
    # messenger
    # webchat
    # email
    # telegram
    # whatsapp
    # tinode
    # api

    provider = db.Column(String(100))
    external_id = db.Column(String(255), index=True)
    external_name = db.Column(String(255))
    avatar = db.Column(String())
    icon = db.Column(String())
    webhook_url = db.Column(String())
    webhook_secret = db.Column(String())
    access_token = db.Column(Text())
    refresh_token = db.Column(Text())
    config = db.Column(JSONB)
    active = db.Column(Boolean(), default=True)
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "code",
            name="uq_chat_channel_code"
        ),
    )

# Conversation
# Đây là Aggregate Root.
class Conversation(CommonModel):
    __tablename__ = "conversation"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_no = db.Column(String(100), unique=True, index=True)
    channel_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("chat_channel.id"),
        index=True
    )
    channel_thread_id = db.Column(String(255), index=True)
    tinode_topic = db.Column(String(255), index=True)
    contact_id = db.Column(UUID(as_uuid=True), index=True)
    organization_id = db.Column(UUID(as_uuid=True), index=True)
    subject = db.Column(String(500))
    source = db.Column(String(30))
    # inbound
    # outbound

    status = db.Column(String(30), default="OPEN")
    # OPEN
    # BOT
    # WAITING
    # ASSIGNED
    # RESOLVED
    # CLOSED

    priority = db.Column(String(20), default="NORMAL")
    # LOW
    # NORMAL
    # HIGH
    # URGENT

    first_message_at = db.Column(BigInteger())
    last_message_at = db.Column(BigInteger())
    closed_at = db.Column(BigInteger())
    assigned_agent_id = db.Column(UUID(as_uuid=True))
    assigned_queue_id = db.Column(UUID(as_uuid=True))
    properties = db.Column(JSONB)

class ConversationParticipant(CommonModel):
    __tablename__ = "conversation_participant"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("conversation.id"),
        index=True
    )
    participant_type = db.Column(String(30))
    # CONTACT
    # USER
    # BOT
    participant_id = db.Column(String(100), index=True)
    role = db.Column(String(30))
    # OWNER
    # ADMIN (deputy group manager)
    # MEMBER
    # WATCHER

    joined_at = db.Column(BigInteger())
    left_at = db.Column(BigInteger())
    active = db.Column(Boolean(), default=True)
    # PENDING members stay outside the active/Tinode membership until approved.
    approval_status = db.Column(String(20), nullable=False, default="APPROVED", index=True)
    # NULL means enabled, 0 means muted until manually enabled, otherwise Unix seconds.
    notification_muted_until = db.Column(BigInteger())
    # NULL means the conversation is not pinned for this participant.
    pinned_at = db.Column(BigInteger())
    # NULL means direct messaging is allowed; otherwise this participant blocked the peer.
    blocked_at = db.Column(BigInteger())

class ChatAgent(CommonModel):
    __tablename__ = "chat_agent"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    user_id = db.Column(UUID(as_uuid=True), nullable=False, index=True)
    department_id = db.Column(UUID(as_uuid=True), index=True)
    team_id = db.Column(UUID(as_uuid=True), index=True)
    code = db.Column(String(100), index=True)
    display_name = db.Column(String(255))
    language = db.Column(String(20))
    max_session = db.Column(Integer(), default=10)
    current_session = db.Column(Integer(), default=0)
    routing_priority = db.Column(Integer(), default=100)
    online = db.Column(Boolean(), default=False)
    active = db.Column(Boolean(), default=True)

class ChatQueue(CommonModel):
    __tablename__ = "chat_queue"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    code = db.Column(String(100), nullable=False)
    name = db.Column(String(255), nullable=False)
    strategy = db.Column(String(30))
    # ROUND_ROBIN
    # LEAST_BUSY
    # PRIORITY
    # RANDOM

    max_wait_second = db.Column(Integer())
    sla_first_response = db.Column(Integer())
    sla_resolve = db.Column(Integer())
    overflow_queue_id = db.Column(UUID(as_uuid=True))
    active = db.Column(Boolean(), default=True)
    properties = db.Column(JSONB)

class ChatQueueAgent(CommonModel):
    __tablename__ = "chat_queue_agent"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    queue_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("chat_queue.id"),
        index=True
    )

    agent_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("chat_agent.id"),
        index=True
    )

    priority = db.Column(Integer(), default=100)
    weight = db.Column(Integer(), default=1)
    active = db.Column(Boolean(), default=True)
    __table_args__ = (
        UniqueConstraint(
            "queue_id",
            "agent_id",
            name="uq_queue_agent"
        ),
    )

class ChatBot(CommonModel):
    __tablename__ = "chat_bot"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    code = db.Column(String(100), nullable=False)
    name = db.Column(String(255))
    provider = db.Column(String(100))
    # OpenAI
    # Gemini
    # Claude

    model = db.Column(String(100))
    system_prompt = db.Column(Text())
    workflow_id = db.Column(UUID(as_uuid=True))
    knowledge_base_id = db.Column(UUID(as_uuid=True))
    temperature = db.Column(Float(), default=0.2)
    max_tokens = db.Column(Integer())
    active = db.Column(Boolean(), default=True)
    properties = db.Column(JSONB)

# RoutingRule
# Đây là bảng quan trọng nhất.
class ChatRoutingRule(CommonModel):
    __tablename__ = "chat_routing_rule"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    code = db.Column(String(100))
    name = db.Column(String(255))
    priority = db.Column(Integer(), default=100)
    channel_id = db.Column(UUID(as_uuid=True))
    expression = db.Column(JSONB)
    action = db.Column(String(30))
    # ASSIGN_QUEUE
    # ASSIGN_AGENT
    # CALL_BOT
    # WORKFLOW
    # WEBHOOK

    target_type = db.Column(String(30))
    # QUEUE
    # AGENT
    # BOT
    # WORKFLOW

    target_id = db.Column(UUID(as_uuid=True))
    active = db.Column(Boolean(), default=True)

class ConversationAutomation(CommonModel):
    __tablename__ = "conversation_automation"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_id = db.Column(UUID(as_uuid=True), index=True)
    workflow_id = db.Column(UUID(as_uuid=True), index=True)
    trigger_event = db.Column(String(100))
    status = db.Column(String(30))
    # PENDING
    # RUNNING
    # SUCCESS
    # FAILED

    started_at = db.Column(BigInteger())
    finished_at = db.Column(BigInteger())
    result = db.Column(JSONB)

# ConversationTimeline
# Không lưu message.
# Chỉ lưu business event.
class ConversationTimeline(CommonModel):
    __tablename__ = "conversation_timeline"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_id = db.Column(UUID(as_uuid=True), index=True)
    event_name = db.Column(String(100), index=True)
    # CREATED
    # ASSIGNED
    # BOT_REPLY
    # TRANSFER
    # CLOSED
    # WEBHOOK
    # WORKFLOW

    actor_type = db.Column(String(30))
    # USER
    # BOT
    # SYSTEM

    actor_id = db.Column(UUID(as_uuid=True))
    data = db.Column(JSONB)
    event_time = db.Column(BigInteger(), index=True)


# Knowledge base used by the chatbot retrieval layer. Chat messages continue
# to live in Tinode; these tables only store curated source material.
class KnowledgeBase(CommonModel):
    __tablename__ = "knowledge_base"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    code = db.Column(String(100), nullable=False)
    name = db.Column(String(255), nullable=False)
    description = db.Column(Text())
    access_scope = db.Column(String(30), default="COMPANY", nullable=False)
    allowed_department_ids = db.Column(JSONB)
    active = db.Column(Boolean(), default=True, nullable=False)
    properties = db.Column(JSONB)
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_knowledge_base_code"),
    )


class KnowledgeDocument(CommonModel):
    __tablename__ = "knowledge_document"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    knowledge_base_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_base.id"),
        nullable=False,
        index=True,
    )
    title = db.Column(String(500), nullable=False)
    file_name = db.Column(String(500))
    mime_type = db.Column(String(255))
    source_type = db.Column(String(30), default="TEXT", nullable=False)
    source_url = db.Column(Text())
    checksum = db.Column(String(64), index=True)
    version = db.Column(Integer(), default=1, nullable=False)
    status = db.Column(String(30), default="READY", nullable=False, index=True)
    extracted_text = db.Column(Text())
    uploaded_by = db.Column(String(100), index=True)
    properties = db.Column(JSONB)


class KnowledgeChunk(CommonModel):
    __tablename__ = "knowledge_chunk"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    knowledge_base_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_base.id"),
        nullable=False,
        index=True,
    )
    document_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_document.id"),
        nullable=False,
        index=True,
    )
    chunk_index = db.Column(Integer(), nullable=False)
    page_number = db.Column(Integer())
    content = db.Column(Text(), nullable=False)
    content_search = db.Column(Text(), nullable=False)
    token_count = db.Column(Integer())
    # JSONB keeps the schema deployable on plain PostgreSQL. A later migration
    # can convert this to pgvector without changing the service API.
    embedding = db.Column(JSONB)
    properties = db.Column(JSONB)
    __table_args__ = (
        UniqueConstraint("document_id", "chunk_index", name="uq_knowledge_chunk_index"),
    )


class ChatbotRun(CommonModel):
    __tablename__ = "chatbot_run"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_ref = db.Column(String(255), index=True)
    user_ref = db.Column(String(100), index=True)
    bot_id = db.Column(UUID(as_uuid=True), index=True)
    provider = db.Column(String(100))
    model = db.Column(String(100))
    status = db.Column(String(30), nullable=False, index=True)
    matched_chunk_ids = db.Column(JSONB)
    prompt_tokens = db.Column(Integer())
    completion_tokens = db.Column(Integer())
    latency_ms = db.Column(Integer())
    error_code = db.Column(String(100))
    properties = db.Column(JSONB)


class ChatbotMessage(CommonModel):
    __tablename__ = "chatbot_message"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    conversation_ref = db.Column(String(255), nullable=False, index=True)
    user_ref = db.Column(String(100), nullable=False, index=True)
    role = db.Column(String(20), nullable=False)
    content = db.Column(Text(), nullable=False)
    message_ref = db.Column(String(255), index=True)
    properties = db.Column(JSONB)
    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "conversation_ref",
            "user_ref",
            "message_ref",
            name="uq_chatbot_message_ref",
        ),
    )


class FriendRequest(CommonModel):
    __tablename__ = "friend_request"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    requester_id = db.Column(String(100), nullable=False, index=True)
    requester_name = db.Column(String(255))
    recipient_id = db.Column(String(100), nullable=False, index=True)
    recipient_name = db.Column(String(255))
    note = db.Column(String(500))
    status = db.Column(String(20), nullable=False, default="PENDING", index=True)
    responder_id = db.Column(String(100))
    responder_name = db.Column(String(255))
    responded_at = db.Column(BigInteger())
    properties = db.Column(JSONB)


class ManagementTenant(db.Model):
    __tablename__ = "management_tenant"
    id = db.Column(String(50), primary_key=True)
    name = db.Column(String(255), nullable=False)
    active = db.Column(Boolean(), default=True, nullable=False)
    created_at = db.Column(BigInteger(), index=True)
    updated_at = db.Column(BigInteger(), index=True)
    properties = db.Column(JSONB)


class ManagementAccount(db.Model):
    __tablename__ = "management_account"
    id = db.Column(String(100), primary_key=True)
    tenant_id = db.Column(String(50), nullable=False, index=True)
    username = db.Column(String(100), nullable=False, index=True)
    email = db.Column(String(255), index=True)
    password_hash = db.Column(String(255), nullable=False)
    full_name = db.Column(String(255), nullable=False)
    role = db.Column(String(50), nullable=False, default="member")
    department = db.Column(String(255))
    title = db.Column(String(255))
    avatar = db.Column(Text())
    tinode_username = db.Column(String(100), nullable=False)
    tinode_uid = db.Column(String(100))
    active = db.Column(Boolean(), default=True, nullable=False)
    created_at = db.Column(BigInteger(), index=True)
    updated_at = db.Column(BigInteger(), index=True)
    last_login_at = db.Column(BigInteger())
    properties = db.Column(JSONB)
    __table_args__ = (
        UniqueConstraint("tenant_id", "username", name="uq_management_account_username"),
        UniqueConstraint("tenant_id", "email", name="uq_management_account_email"),
    )


class EnterpriseItem(CommonModel):
    __tablename__ = "enterprise_item"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    item_type = db.Column(String(30), nullable=False, index=True)
    title = db.Column(String(500), nullable=False)
    description = db.Column(Text())
    status = db.Column(String(30), nullable=False, index=True)
    priority = db.Column(String(20), nullable=False, default="NORMAL", index=True)
    visibility = db.Column(String(20), nullable=False, default="COMPANY", index=True)
    created_by = db.Column(String(100), nullable=False, index=True)
    owner_id = db.Column(String(100), index=True)
    conversation_id = db.Column(UUID(as_uuid=True), index=True)
    source_message_ref = db.Column(String(255), index=True)
    due_at = db.Column(BigInteger(), index=True)
    starts_at = db.Column(BigInteger(), index=True)
    ends_at = db.Column(BigInteger(), index=True)
    published_at = db.Column(BigInteger(), index=True)
    closed_at = db.Column(BigInteger(), index=True)
    version = db.Column(Integer(), nullable=False, default=1)
    search_text = db.Column(Text(), nullable=False, default="")
    properties = db.Column(JSONB)
    __table_args__ = (
        Index("ix_enterprise_item_tenant_type_updated", "tenant_id", "item_type", "updated_at"),
        Index("ix_enterprise_item_tenant_status_due", "tenant_id", "status", "due_at"),
    )


class EnterpriseItemParticipant(CommonModel):
    __tablename__ = "enterprise_item_participant"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    item_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("enterprise_item.id"),
        nullable=False,
        index=True,
    )
    account_id = db.Column(String(100), nullable=False, index=True)
    role = db.Column(String(30), nullable=False, index=True)
    state = db.Column(String(30), nullable=False, default="PENDING", index=True)
    responded_at = db.Column(BigInteger(), index=True)
    acknowledged_at = db.Column(BigInteger(), index=True)
    properties = db.Column(JSONB)
    __table_args__ = (
        Index("ix_enterprise_participant_account", "tenant_id", "account_id", "item_id"),
    )


class EnterpriseActivity(CommonModel):
    __tablename__ = "enterprise_activity"
    tenant_id = db.Column(String(50), nullable=False, index=True)
    item_id = db.Column(
        UUID(as_uuid=True),
        ForeignKey("enterprise_item.id"),
        nullable=False,
        index=True,
    )
    actor_id = db.Column(String(100), nullable=False, index=True)
    action = db.Column(String(50), nullable=False, index=True)
    from_status = db.Column(String(30))
    to_status = db.Column(String(30))
    comment = db.Column(Text())
    data = db.Column(JSONB)
    __table_args__ = (
        Index("ix_enterprise_activity_item_created", "tenant_id", "item_id", "created_at"),
    )


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_token"
    id = db.Column(String(100), primary_key=True)
    tenant_id = db.Column(String(50), nullable=False, index=True)
    account_id = db.Column(
        String(100),
        ForeignKey("management_account.id"),
        nullable=False,
        index=True,
    )
    token_hash = db.Column(String(64), nullable=False, unique=True, index=True)
    expires_at = db.Column(BigInteger(), nullable=False, index=True)
    used_at = db.Column(BigInteger(), index=True)
    requested_ip = db.Column(String(100))
    created_at = db.Column(BigInteger(), nullable=False, index=True)


class SecurityAuditLog(CommonModel):
    __tablename__ = "security_audit_log"
    tenant_id = db.Column(String(50), index=True)
    user_id = db.Column(String(100), index=True)
    event_name = db.Column(String(100), nullable=False, index=True)
    success = db.Column(Boolean(), nullable=False, default=True)
    ip_address = db.Column(String(100))
    user_agent = db.Column(String(500))
    properties = db.Column(JSONB)
