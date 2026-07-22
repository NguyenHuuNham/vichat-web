import re

import aiohttp


class ChatbotServiceError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.status_code = status_code


class ChatbotService(object):
    """OpenAI-compatible model client. Retrieval is handled by ChatManagerService."""

    def __init__(self, app):
        self.app = app

    @property
    def enabled(self):
        provider = str(self.app.config.get("CHATBOT_PROVIDER", "openai-compatible")).lower()
        if provider == "local":
            return bool(self.app.config.get("CHATBOT_ENABLED", False))
        return bool(
            self.app.config.get("CHATBOT_ENABLED", False)
            and self.app.config.get("CHATBOT_API_URL")
            and self.app.config.get("CHATBOT_API_KEY")
            and self.app.config.get("CHATBOT_MODEL")
        )

    async def _local_reply(self, context=None):
        """Answer from retrieved company data without an external API key."""
        if not context:
            return {
                "reply": "Dữ liệu nội bộ cho câu hỏi này chưa được cập nhật.",
                "model": "local-knowledge",
                "provider": "local",
                "usage": {},
            }
        blocks = [item.strip() for item in str(context).split("\n\n") if item.strip()]
        # Return the most relevant answer only. The source metadata is kept by
        # ChatManagerService for audit, but is not repeated in the chat bubble.
        answer = re.sub(r"^\[Nguồn\s+\d+[^\n]*\]\s*", "", blocks[0], flags=re.IGNORECASE)
        return {
            "reply": answer[:1200].rstrip(),
            "model": "local-knowledge",
            "provider": "local",
            "usage": {},
        }

    @staticmethod
    def _history_messages(history):
        messages = []
        for item in (history or [])[-10:]:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content") or item.get("text")
            if role not in ("user", "assistant") or not isinstance(content, str) or not content.strip():
                continue
            messages.append({"role": role, "content": content.strip()[:4000]})
        return messages

    async def reply(self, message, user=None, conversation_id=None, context=None, history=None, system_prompt=None):
        if not self.enabled:
            raise ChatbotServiceError("Chatbot chưa được cấu hình trên server.", status_code=503)

        if str(self.app.config.get("CHATBOT_PROVIDER", "openai-compatible")).lower() == "local":
            return await self._local_reply(context=context)

        api_url = self.app.config.get("CHATBOT_API_URL")
        api_key = self.app.config.get("CHATBOT_API_KEY")
        model = self.app.config.get("CHATBOT_MODEL")
        timeout_seconds = self.app.config.get("CHATBOT_TIMEOUT", 30)
        prompt = system_prompt or self.app.config.get("CHATBOT_SYSTEM_PROMPT")

        user_context = ""
        if user:
            display_name = user.get("name") or user.get("full_name") or user.get("user_name")
            organization = user.get("organization") or {}
            organization_name = organization.get("name") if isinstance(organization, dict) else None
            if display_name:
                user_context += "\nNgười dùng hiện tại: {}.".format(display_name)
            if organization_name:
                user_context += "\nĐơn vị: {}.".format(organization_name)

        knowledge_context = ""
        if context:
            knowledge_context = (
                "\n\nDỮ LIỆU NỘI BỘ ĐƯỢC PHÉP SỬ DỤNG:\n{}\n\n"
                "Chỉ trả lời các dữ kiện nội bộ dựa trên phần dữ liệu trên. "
                "Trả lời ngắn gọn đúng phần người dùng hỏi, không liệt kê toàn bộ tài liệu hoặc nguồn."
            ).format(context)

        messages = [{"role": "system", "content": "{}{}{}".format(prompt, user_context, knowledge_context)}]
        messages.extend(self._history_messages(history))
        messages.append({"role": "user", "content": message})
        payload = {
            "model": model,
            "messages": messages,
            "temperature": self.app.config.get("CHATBOT_TEMPERATURE", 0.2),
            "max_tokens": self.app.config.get("CHATBOT_MAX_TOKENS", 800),
        }

        headers = {"Authorization": "Bearer {}".format(api_key), "Content-Type": "application/json"}
        if conversation_id:
            headers["X-Conversation-Id"] = str(conversation_id)

        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(api_url, json=payload, headers=headers) as response:
                    try:
                        data = await response.json(content_type=None)
                    except Exception:
                        data = {"error": {"message": await response.text()}}
                    if response.status < 200 or response.status >= 300:
                        provider_message = data.get("error", {})
                        if isinstance(provider_message, dict):
                            provider_message = provider_message.get("message")
                        raise ChatbotServiceError(provider_message or "Nhà cung cấp AI trả về lỗi.", 502)

                    choices = data.get("choices") or []
                    content = (choices[0].get("message") or {}).get("content") if choices else None
                    content = content or data.get("reply") or data.get("text")
                    if not content:
                        raise ChatbotServiceError("Nhà cung cấp AI không trả về nội dung.")
                    return {
                        "reply": str(content).strip(),
                        "model": data.get("model") or model,
                        "provider": self.app.config.get("CHATBOT_PROVIDER", "openai-compatible"),
                        "usage": data.get("usage") or {},
                    }
        except ChatbotServiceError:
            raise
        except aiohttp.ClientError as error:
            raise ChatbotServiceError("Không thể kết nối nhà cung cấp AI: {}".format(error))
        except Exception as error:
            raise ChatbotServiceError("Chatbot xử lý thất bại: {}".format(error))
