import re
import unicodedata

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
            request_mode = self._external_request_mode()
            return bool(
                self.app.config.get("CHATBOT_ENABLED", False)
                and self.app.config.get("CHATBOT_API_URL")
                and (
                    request_mode not in ("knowledge-retrieval", "retrieval", "rag")
                    or str(self.app.config.get("CHATBOT_API_KEY") or "").strip()
                )
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

    def _retrieval_history(self, history):
        """Keep only recent chat turns needed for provider style/context."""
        if not self.app.config.get("CHATBOT_RETRIEVAL_INCLUDE_HISTORY", True):
            return []
        return [
            {"role": item["role"], "content": item["content"][:800]}
            for item in self._history_messages(history)[-6:]
        ]

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

    def _external_headers(self, tenant_id=None):
        headers = {"Content-Type": "application/json"}
        api_key = str(self.app.config.get("CHATBOT_API_KEY") or "").strip()
        if api_key:
            header_name = str(
                self.app.config.get("CHATBOT_EXTERNAL_AUTH_HEADER") or "Authorization"
            ).strip()
            configured_scheme = self.app.config.get("CHATBOT_EXTERNAL_AUTH_SCHEME")
            scheme = "Bearer" if configured_scheme is None else str(configured_scheme).strip()
            headers[header_name] = "{} {}".format(scheme, api_key).strip()
        if tenant_id:
            headers["X-Tenant-Id"] = str(tenant_id).strip()[:255]
        return headers

    def _external_request_mode(self):
        return str(
            self.app.config.get("CHATBOT_EXTERNAL_REQUEST_MODE") or "chat"
        ).strip().lower()

    def _retrieval_limit(self):
        try:
            return min(
                max(int(self.app.config.get("CHATBOT_RETRIEVAL_LIMIT", 6)), 1),
                20,
            )
        except (TypeError, ValueError):
            return 6

    def _tenant_filter_required(self):
        value = self.app.config.get("CHATBOT_TENANT_FILTER_REQUIRED", True)
        if isinstance(value, bool):
            return value
        return str(value or "").strip().lower() in ("1", "true", "yes", "on")

    def _files_url(self):
        configured = str(self.app.config.get("CHATBOT_FILES_URL") or "").strip()
        if configured:
            return configured
        api_url = str(self.app.config.get("CHATBOT_API_URL") or "").strip().rstrip("/")
        if api_url.endswith("/chat"):
            return "{}/files".format(api_url[:-5])
        return ""

    def _external_payload(
        self,
        message,
        user=None,
        conversation_id=None,
        context=None,
        history=None,
        include_context=True,
    ):
        if self._external_request_mode() in ("knowledge-retrieval", "retrieval", "rag"):
            safe_user = user if isinstance(user, dict) else {}
            tenant_id = str(
                safe_user.get("current_tenant_id") or safe_user.get("tenant_id") or ""
            ).strip()
            payload = {
                "message": str(message or "").strip(),
                # The provider currently searches a shared collection. Request
                # its maximum candidates, then return only verified tenant files.
                "top_k": 20 if self._tenant_filter_required() else self._retrieval_limit(),
            }
            if tenant_id:
                # The tenant comes from Chatmgt's verified session/Tinode
                # account, never from the browser request body.
                payload["tenant_id"] = tenant_id[:255]
            retrieval_history = self._retrieval_history(history)
            if retrieval_history:
                payload["history"] = retrieval_history
            return payload

        safe_user = {}
        if isinstance(user, dict):
            for key in (
                "id", "uid", "name", "full_name", "user_name", "username",
                "email", "department", "department_id", "tenant_id",
            ):
                value = str(user.get(key) or "").strip()[:500]
                if value:
                    safe_user[key] = value

        payload = {
            "message": message,
            "conversation_id": str(conversation_id or ""),
            "history": self._history_messages(history),
            "user": safe_user,
        }
        if include_context:
            payload["context"] = str(context or "")
        return payload

    @staticmethod
    def _file_key(value):
        name = str(value or "").strip().replace("\\", "/").rsplit("/", 1)[-1]
        return unicodedata.normalize("NFKC", name).casefold()

    async def _tenant_source_manifest(self, session, tenant_id):
        tenant_id = str(tenant_id or "").strip()[:255]
        if not tenant_id:
            raise ChatbotServiceError("Verified tenant is required for RAG retrieval.", 503)
        files_url = self._files_url()
        if not files_url:
            raise ChatbotServiceError("RAG tenant manifest URL is not configured.", 503)

        async with session.get(
            files_url,
            headers=self._external_headers(tenant_id),
        ) as response:
            try:
                data = await response.json(content_type=None)
            except Exception:
                data = {"text": await response.text()}
            if response.status < 200 or response.status >= 300:
                raise ChatbotServiceError(
                    "Could not verify the RAG tenant manifest (HTTP {}).".format(response.status),
                    502,
                )

        raw_files = data.get("files") if isinstance(data, dict) else None
        if not isinstance(raw_files, list):
            raise ChatbotServiceError("RAG tenant manifest returned an invalid response.", 502)
        try:
            manifest_total = int(data.get("total"))
        except (TypeError, ValueError, AttributeError):
            manifest_total = -1
        if manifest_total != len(raw_files):
            raise ChatbotServiceError("RAG tenant manifest is incomplete.", 502)

        id_tenants = {}
        name_tenants = {}
        for item in raw_files:
            if not isinstance(item, dict):
                raise ChatbotServiceError("RAG tenant manifest contains an invalid file.", 502)
            item_tenant = str(item.get("tenant_id") or "").strip()[:255]
            file_name = self._file_key(item.get("file_name"))
            if not item_tenant or not file_name:
                raise ChatbotServiceError("RAG tenant manifest contains an unscoped file.", 502)
            file_id = str(item.get("file_id") or "").strip()
            if file_id:
                id_tenants.setdefault(file_id, set()).add(item_tenant)
            if file_name:
                name_tenants.setdefault(file_name, set()).add(item_tenant)

        return {
            "tenant_id": tenant_id,
            "file_ids": {
                key for key, tenants in id_tenants.items()
                if tenants == {tenant_id}
            },
            "file_names": {
                key for key, tenants in name_tenants.items()
                if tenants == {tenant_id}
            },
        }

    @classmethod
    def _source_matches_tenant(cls, item, tenant_manifest):
        if tenant_manifest is None:
            return True
        tenant_id = tenant_manifest.get("tenant_id")
        source_tenant = str(item.get("tenant_id") or "").strip()[:255]
        if source_tenant and source_tenant != tenant_id:
            return False
        file_id = str(item.get("file_id") or "").strip()
        if file_id:
            return file_id in tenant_manifest.get("file_ids", set())
        keys = {
            cls._file_key(item.get("file_name")),
            cls._file_key(item.get("relative_path")),
        }
        keys.discard("")
        return bool(keys.intersection(tenant_manifest.get("file_names", set())))

    @classmethod
    def _retrieval_sources(cls, data, tenant_manifest=None):
        if not isinstance(data, dict):
            return []
        raw_sources = data.get("sources")
        if not isinstance(raw_sources, list):
            nested = data.get("data")
            raw_sources = nested.get("sources") if isinstance(nested, dict) else []
        sources = []
        for item in (raw_sources or [])[:20]:
            if not isinstance(item, dict):
                continue
            if not cls._source_matches_tenant(item, tenant_manifest):
                continue
            file_name = str(item.get("file_name") or "").strip()
            relative_path = str(item.get("relative_path") or "").strip()
            path_name = relative_path.replace("\\", "/").rsplit("/", 1)[-1]
            title = str(item.get("title") or file_name or path_name or "Tài liệu").strip()
            snippet = str(
                item.get("snippet") or item.get("content") or item.get("text") or ""
            ).strip()
            if not snippet:
                continue
            sources.append({
                "title": title[:500],
                "file_name": file_name[:500] if file_name else None,
                "snippet": snippet[:2000],
                "score": item.get("score"),
            })
        return sources

    @classmethod
    def _retrieval_reply(cls, data, tenant_manifest=None, limit=20):
        sources = cls._retrieval_sources(data, tenant_manifest=tenant_manifest)[:limit]
        provider_answer = None if tenant_manifest is not None else cls._response_content(data)
        if provider_answer:
            return {
                "reply": str(provider_answer).strip()[:8000],
                "sources": sources,
                "grounded": bool(sources),
            }
        if not sources:
            return {
                "reply": (
                    "Mình chưa tìm thấy tài liệu đủ phù hợp để trả lời chắc chắn. "
                    "Bạn thử nêu rõ tên quy trình, phòng ban hoặc từ khóa chính nhé."
                ),
                "sources": [],
                "grounded": False,
            }
        unique_snippets = []
        seen = set()
        for item in sources:
            snippet = " ".join(str(item.get("snippet") or "").split())
            key = snippet.casefold()
            if not snippet or key in seen:
                continue
            seen.add(key)
            unique_snippets.append(snippet)
        summary = "\n\n".join(
            "{}. {}".format(index, snippet)
            for index, snippet in enumerate(unique_snippets[:5], 1)
        )
        return {
            "reply": (
                "Mình đã đối chiếu kho tri thức và tìm thấy các nội dung liên quan:\n\n{}\n\n"
                "Bạn có thể mở phần Nguồn tham khảo để kiểm tra tài liệu gốc."
            ).format(summary)[:8000].rstrip(),
            "sources": sources,
            "grounded": True,
        }

    def _ingest_urls(self):
        primary = str(
            self.app.config.get("CHATBOT_INGEST_URL")
            or "https://knowledge-ai.gonapp.net/api/v1/ingest"
        ).strip()
        fallback = str(
            self.app.config.get("CHATBOT_INGEST_FALLBACK_URL")
            or "https://knowledge-ai.gonapp.net/api/v1/dataroom/callback"
        ).strip()
        urls = []
        for value in (primary, fallback):
            if value and value not in urls:
                urls.append(value)
        return urls

    async def ingest_document(self, payload):
        """Send extracted chat-document text to the external RAG index."""
        if not self.app.config.get("CHATBOT_INGEST_ENABLED", False):
            raise ChatbotServiceError("RAG document ingestion is disabled.", 503)
        payload = payload if isinstance(payload, dict) else {}
        tenant_id = str(payload.get("tenant_id") or "").strip()
        file_id = str(payload.get("file_id") or "").strip()
        file_name = str(payload.get("file_name") or "").strip()
        text_content = str(payload.get("text_content") or "").strip()
        if not tenant_id or not file_id or not file_name or not text_content:
            raise ChatbotServiceError("RAG ingest payload is incomplete.", 400)

        urls = self._ingest_urls()
        if not urls:
            raise ChatbotServiceError("RAG ingest URL is not configured.", 503)
        timeout = aiohttp.ClientTimeout(total=max(
            int(self.app.config.get("CHATBOT_INGEST_TIMEOUT", 45)),
            1,
        ))
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                for index, url in enumerate(urls):
                    async with session.post(
                        url,
                        json=payload,
                        headers=self._external_headers(tenant_id),
                    ) as response:
                        try:
                            data = await response.json(content_type=None)
                        except Exception:
                            data = {"text": await response.text()}
                        if 200 <= response.status < 300:
                            result = data if isinstance(data, dict) else {"data": data}
                            provider_status = str(result.get("status") or "").strip().lower()
                            if provider_status == "error":
                                provider_message = result.get("error")
                                if isinstance(provider_message, dict):
                                    provider_message = provider_message.get("message")
                                provider_message = provider_message or self._response_content(result)
                                raise ChatbotServiceError(
                                    provider_message or "External RAG ingest reported an error.",
                                    502,
                                )
                            return {**result, "ingest_url": url}
                        if response.status in (404, 405) and index + 1 < len(urls):
                            continue
                        provider_message = data.get("error") if isinstance(data, dict) else None
                        if isinstance(provider_message, dict):
                            provider_message = provider_message.get("message")
                        provider_message = provider_message or self._response_content(data)
                        raise ChatbotServiceError(
                            provider_message or "External RAG ingest returned HTTP {}.".format(response.status),
                            502,
                        )
        except ChatbotServiceError:
            raise
        except aiohttp.ClientError as error:
            raise ChatbotServiceError("Could not connect to external RAG ingest: {}".format(error))
        except Exception as error:
            raise ChatbotServiceError("External RAG ingest failed: {}".format(error))

    async def _external_reply(
        self,
        message,
        user=None,
        conversation_id=None,
        context=None,
        history=None,
        include_context=True,
    ):
        api_url = self.app.config.get("CHATBOT_API_URL")
        timeout_seconds = self.app.config.get("CHATBOT_TIMEOUT", 30)
        payload = self._external_payload(
            message=message,
            user=user,
            conversation_id=conversation_id,
            context=context,
            history=history,
            include_context=include_context,
        )
        timeout = aiohttp.ClientTimeout(total=timeout_seconds)
        payloads = [payload]
        retrieval_mode = self._external_request_mode() in (
            "knowledge-retrieval", "retrieval", "rag"
        )
        if retrieval_mode and self._tenant_filter_required() and not payload.get("tenant_id"):
            raise ChatbotServiceError("Verified tenant is required for RAG retrieval.", 503)
        if retrieval_mode and payload.get("history"):
            # Older retrieval endpoints reject unknown fields. Retry without
            # context only for schema errors so the existing AI flow survives.
            payloads.append({key: value for key, value in payload.items() if key != "history"})
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                for attempt, request_payload in enumerate(payloads):
                    async with session.post(
                        api_url,
                        json=request_payload,
                        headers=self._external_headers(request_payload.get("tenant_id")),
                    ) as response:
                        try:
                            data = await response.json(content_type=None)
                        except Exception:
                            data = {"text": await response.text()}
                        if response.status < 200 or response.status >= 300:
                            if attempt + 1 < len(payloads) and response.status in (400, 415, 422):
                                continue
                            provider_message = data.get("error") if isinstance(data, dict) else None
                            if isinstance(provider_message, dict):
                                provider_message = provider_message.get("message")
                            provider_message = provider_message or self._response_content(data)
                            raise ChatbotServiceError(
                                provider_message or "External chatbot returned an error.",
                                502,
                            )

                        if retrieval_mode:
                            tenant_manifest = None
                            if self._tenant_filter_required():
                                # Validate ownership after retrieval so a newly
                                # ambiguous filename fails closed immediately.
                                tenant_manifest = await self._tenant_source_manifest(
                                    session,
                                    request_payload.get("tenant_id"),
                                )
                            retrieval = self._retrieval_reply(
                                data,
                                tenant_manifest=tenant_manifest,
                                limit=self._retrieval_limit(),
                            )
                            return {
                                **retrieval,
                                "model": None,
                                "provider": self.app.config.get("CHATBOT_PROVIDER", "external-webhook"),
                                "usage": {
                                    "retrieval_time_ms": data.get("retrieval_time_ms")
                                    if isinstance(data, dict) else None,
                                },
                            }

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

    async def reply(
        self,
        message,
        user=None,
        conversation_id=None,
        context=None,
        history=None,
        system_prompt=None,
        include_context=True,
    ):
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
                include_context=include_context,
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
