import json
import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def tinode_message_text(content):
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        text = content.get("txt") or content.get("text")
        return str(text or "").strip()
    return ""


def tinode_contact_topics(meta):
    subscriptions = (meta or {}).get("sub") or []
    if isinstance(subscriptions, dict):
        subscriptions = [subscriptions]
    topics = []
    for subscription in subscriptions:
        if not isinstance(subscription, dict) or subscription.get("deleted"):
            continue
        topic = str(subscription.get("topic") or subscription.get("user") or "").strip()
        if topic.startswith("usr"):
            topics.append(topic)
    return list(dict.fromkeys(topics))


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
