import logging
import time

from application.database import db
from application.models.models import ChatbotRun
from application.services.chatbot_service import ChatbotServiceError
from application.services.knowledge_service import normalize_search_text


logger = logging.getLogger(__name__)


class ChatManagerService(object):
    """Coordinates identity, retrieval, model execution and audit logging."""

    def __init__(self, app, chatbot_service, knowledge_service):
        self.app = app
        self.chatbot_service = chatbot_service
        self.knowledge_service = knowledge_service

    @staticmethod
    def _user_value(user, *names):
        if not isinstance(user, dict):
            return None
        for name in names:
            if user.get(name) is not None:
                return user.get(name)
        return None

    def _record_run(self, **values):
        try:
            db.session.add(ChatbotRun(**values))
            db.session.commit()
        except Exception as error:
            db.session.rollback()
            logger.warning("Could not record chatbot run: %s", error)

    @staticmethod
    def _is_small_talk(message):
        normalized = normalize_search_text(message)
        return normalized in {
            "hi", "hello", "hey", "alo", "chao", "chao ban", "xin chao",
            "xin chao ban", "cam on", "thanks", "thank you", "ok", "oke",
        }

    async def reply(self, message, user, conversation_id, tenant_id, knowledge_base_id=None, history=None):
        started_at = time.time()
        department_id = self._user_value(user, "department_id", "organization_id")
        user_ref = self._user_value(user, "id", "uid", "user_name", "username")
        user_ids = []
        if isinstance(user, dict):
            user_ids = [user.get(name) for name in (
                "id", "uid", "tinodeUid", "tinode_uid", "user_name", "username", "email",
            ) if user.get(name)]
        provider = str(self.app.config.get("CHATBOT_PROVIDER") or "").lower()
        external_provider = provider in ("external", "external-webhook", "webhook")
        small_talk = self._is_small_talk(message) and not external_provider
        matches = [] if small_talk else self.knowledge_service.retrieve(
            message,
            tenant_id=tenant_id,
            knowledge_base_id=knowledge_base_id,
            department_id=department_id,
            user_ids=user_ids,
        )
        sources = [{
            "document_id": item["document_id"],
            "title": item["title"],
            "file_name": item.get("file_name"),
            "page_number": item.get("page_number"),
            "score": item["score"],
        } for item in matches]

        if small_talk:
            result = {
                "reply": "Chào bạn! Mình là Trợ lý Sông Hồng. Bạn có thể hỏi mình về thông tin nội bộ hoặc cách sử dụng hệ thống.",
                "provider": "knowledge-base",
                "model": None,
                "sources": [],
                "grounded": False,
            }
            self._record_run(
                tenant_id=tenant_id,
                conversation_ref=str(conversation_id or ""),
                user_ref=str(user_ref or ""),
                provider=result["provider"],
                status="SMALL_TALK",
                matched_chunk_ids=[],
                latency_ms=int((time.time() - started_at) * 1000),
                properties={},
            )
            return result

        if self.app.config.get("CHATBOT_KNOWLEDGE_ONLY", True) and not matches and not external_provider:
            result = {
                "reply": "Dữ liệu nội bộ cho câu hỏi này chưa được cập nhật.",
                "provider": "knowledge-base",
                "model": None,
                "sources": [],
                "grounded": False,
            }
            self._record_run(
                tenant_id=tenant_id,
                conversation_ref=str(conversation_id or ""),
                user_ref=str(user_ref or ""),
                provider=result["provider"],
                status="NO_CONTEXT",
                matched_chunk_ids=[],
                latency_ms=int((time.time() - started_at) * 1000),
                properties={},
            )
            return result

        try:
            result = await self.chatbot_service.reply(
                message=message,
                user=user,
                conversation_id=conversation_id,
                context=self.knowledge_service.format_context(matches),
                history=history,
            )
            usage = result.pop("usage", {})
            # Do not render a list of source titles in every chat bubble. The
            # matched chunks remain in chatbot_run for audit and diagnostics.
            result.update({"sources": [], "grounded": bool(matches)})
            self._record_run(
                tenant_id=tenant_id,
                conversation_ref=str(conversation_id or ""),
                user_ref=str(user_ref or ""),
                provider=result.get("provider"),
                model=result.get("model"),
                status="SUCCESS",
                matched_chunk_ids=[item["chunk_id"] for item in matches],
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                latency_ms=int((time.time() - started_at) * 1000),
                properties={"source_count": len(sources)},
            )
            return result
        except ChatbotServiceError as error:
            self._record_run(
                tenant_id=tenant_id,
                conversation_ref=str(conversation_id or ""),
                user_ref=str(user_ref or ""),
                provider=self.app.config.get("CHATBOT_PROVIDER"),
                model=self.app.config.get("CHATBOT_MODEL"),
                status="FAILED",
                matched_chunk_ids=[item["chunk_id"] for item in matches],
                latency_ms=int((time.time() - started_at) * 1000),
                error_code="PROVIDER_ERROR",
                properties={"message": str(error)[:500]},
            )
            raise
