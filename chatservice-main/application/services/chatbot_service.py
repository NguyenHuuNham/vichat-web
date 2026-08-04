import re

import aiohttp


class ChatbotServiceError(Exception):
    def __init__(self, message, status_code=502):
        super().__init__(message)
        self.status_code = status_code


class ChatbotService(object):
    """Model or webhook client. Retrieval is handled by ChatManagerService."""

    def __init__(self, app):
        self.app = app

    @property
    def enabled(self):
        provider = str(self.app.config.get("CHATBOT_PROVIDER", "openai-compatible")).lower()
        if provider == "local":
            return bool(self.app.config.get("CHATBOT_ENABLED", False))
        if provider in ("external", "external-webhook", "webhook"):
            return bool(
                self.app.config.get("CHATBOT_ENABLED", False)
                and self.app.config.get("CHATBOT_API_URL")
            )
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

    @staticmethod
    def _response_content(data):
        if isinstance(data, str):
            return data.strip() or None
        if isinstance(data, list):
            for item in data:
                content = ChatbotService._response_content(item)
                if content:
                    return content
            return None
        if not isinstance(data, dict):
            return None

        choices = data.get("choices") or []
        if choices and isinstance(choices[0], dict):
            choice = choices[0]
            message = choice.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message.get("content")
            if isinstance(choice.get("text"), str):
                return choice.get("text")

        for key in ("reply", "answer", "text", "message", "content"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value
            if isinstance(value, dict):
                nested = ChatbotService._response_content(value)
                if nested:
                    return nested

        nested_data = data.get("data")
        if isinstance(nested_data, dict):
            return ChatbotService._response_content(nested_data)
        return None

    def _external_headers(self):
        headers = {"Content-Type": "application/json"}
        api_key = str(self.app.config.get("CHATBOT_API_KEY") or "").strip()
        if not api_key:
            return headers

        header_name = str(
            self.app.config.get("CHATBOT_EXTERNAL_AUTH_HEADER") or "Authorization"
        ).strip()
        configured_scheme = self.app.config.get("CHATBOT_EXTERNAL_AUTH_SCHEME")
        scheme = "Bearer" if configured_scheme is None else str(configured_scheme).strip()
        headers[header_name] = "{} {}".format(scheme, api_key).strip()
        return headers

    def _external_payload(self, message, user=None, conversation_id=None, context=None, history=None):
        safe_user = {}
        if isinstance(user, dict):
            for key in (
                "id", "uid", "name", "full_name", "user_name", "username",
                "email", "department", "department_id", "tenant_id",
            ):
                value = str(user.get(key) or "").strip()[:500]
                if value:
                    safe_user[key] = value

        return {
            "message": message,
            "conversation_id": str(conversation_id or ""),
            "history": self._history_messages(history),
            "user": safe_user,
            "context": str(context or ""),
        }

    async def _external_reply(self, message, user=None, conversation_id=None, context=None, history=None):
        api_url = self.app.config.get("CHATBOT_API_URL")
        timeout_seconds = self.app.config.get("CHATBOT_TIMEOUT", 30)
        payload = self._external_payload(
            message=message,
            user=user,
            conversation_id=conversation_id,
            context=context,
            history=history,
        )
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    api_url,
                    json=payload,
                    headers=self._external_headers(),
                ) as response:
                    try:
                        data = await response.json(content_type=None)
                    except Exception:
                        data = {"text": await response.text()}
                    if response.status < 200 or response.status >= 300:
                        provider_message = data.get("error") if isinstance(data, dict) else None
                        if isinstance(provider_message, dict):
                            provider_message = provider_message.get("message")
                        provider_message = provider_message or self._response_content(data)
                        raise ChatbotServiceError(
                            provider_message or "External chatbot returned an error.",
                            502,
                        )

                    content = self._response_content(data)
                    if not content:
                        raise ChatbotServiceError("External chatbot returned no message content.")
                    response_metadata = data if isinstance(data, dict) else {}
                    return {
                        "reply": str(content).strip(),
                        "model": response_metadata.get("model") or self.app.config.get("CHATBOT_MODEL"),
                        "provider": self.app.config.get("CHATBOT_PROVIDER", "external-webhook"),
                        "usage": response_metadata.get("usage") or {},
                    }
        except ChatbotServiceError:
            raise
        except aiohttp.ClientError as error:
            raise ChatbotServiceError("Could not connect to external chatbot: {}".format(error))
        except Exception as error:
            raise ChatbotServiceError("External chatbot request failed: {}".format(error))

    async def reply(self, message, user=None, conversation_id=None, context=None, history=None, system_prompt=None):
        if not self.enabled:
            raise ChatbotServiceError("Chatbot chưa được cấu hình trên server.", status_code=503)

        provider = str(self.app.config.get("CHATBOT_PROVIDER", "openai-compatible")).lower()
        if provider == "local":
            return await self._local_reply(context=context)
        if provider in ("external", "external-webhook", "webhook"):
            return await self._external_reply(
                message=message,
                user=user,
                conversation_id=conversation_id,
                context=context,
                history=history,
            )

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
