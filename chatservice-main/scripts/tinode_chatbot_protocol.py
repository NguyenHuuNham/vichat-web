import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def tinode_message_text(content):
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        text = content.get("txt") or content.get("text")
        return str(text or "").strip()
    return ""


def tinode_contact_topics(meta, include_groups=False):
    subscriptions = (meta or {}).get("sub") or []
    if isinstance(subscriptions, dict):
        subscriptions = [subscriptions]
    topics = []
    for subscription in subscriptions:
        if not isinstance(subscription, dict) or subscription.get("deleted"):
            continue
        topic = str(subscription.get("topic") or subscription.get("user") or "").strip()
        if topic.startswith("usr") or (include_groups and topic.startswith("grp")):
            topics.append(topic)
    return list(dict.fromkeys(topics))


def _bot_token(value):
    return "".join(char for char in str(value or "").casefold() if char.isalnum())


def _mention_objects(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    if isinstance(value, dict):
        value = [value]
    return [item for item in (value or []) if isinstance(item, dict)]


def tinode_message_mentions_bot(text, head=None, bot_uid=""):
    for mention in _mention_objects((head or {}).get("x-mentions")):
        mention_uid = str(
            mention.get("tinodeUid")
            or mention.get("tinode_uid")
            or mention.get("id")
            or ""
        ).strip()
        if mention_uid and mention_uid == str(bot_uid or "").strip():
            return True
        if _bot_token(mention.get("token") or mention.get("name")) == "vichatai":
            return True
    return bool(re.search(
        r"(?<![\w@])@vi\s*chat\s*ai(?![\w])",
        str(text or ""),
        re.IGNORECASE,
    ))


def tinode_strip_bot_mention(text):
    return re.sub(
        r"(?<![\w@])@vi\s*chat\s*ai(?![\w])\s*",
        "",
        str(text or ""),
        flags=re.IGNORECASE,
    ).strip()


def tinode_websocket_url(base_url, api_key):
    parts = urlsplit(str(base_url or ""))
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if api_key and "apikey" not in query:
        query["apikey"] = api_key
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class CursorStore(object):
    def __init__(self, file_name):
        self.path = Path(file_name)
        self.values = {}
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                values = {}
                for topic, sequence in payload.items():
                    try:
                        sequence = int(sequence)
                    except (TypeError, ValueError):
                        continue
                    if sequence >= 0:
                        values[str(topic)] = sequence
                self.values = values
        except (FileNotFoundError, ValueError, TypeError, OSError):
            self.values = {}

    def get(self, topic):
        return int(self.values.get(str(topic), 0))

    def advance(self, topic, sequence):
        topic = str(topic)
        sequence = int(sequence)
        if sequence <= self.get(topic):
            return
        self.values[topic] = sequence
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(self.values, sort_keys=True), encoding="utf-8")
        os.replace(str(temporary), str(self.path))
