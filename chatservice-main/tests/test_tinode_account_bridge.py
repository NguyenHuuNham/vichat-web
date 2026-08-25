import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

try:
    import aiohttp  # noqa: F401
except ImportError:
    aiohttp = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "scripts" / "tinode_account_bridge.py"

bridge = None
if aiohttp is not None:
    spec = importlib.util.spec_from_file_location("tinode_account_bridge", MODULE_PATH)
    bridge = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bridge)


class FakePolicyResponse:
    def __init__(self, status=200, payload=None):
        self.status = status
        self.payload = payload or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, _error_type, _error, _traceback):
        return False

    async def json(self, content_type=None):
        return self.payload


class FakePolicySession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = self.responses.pop(0) if self.responses else FakePolicyResponse()
        return response


class FakeWebSocket:
    def __init__(self, messages=None):
        self.messages = list(messages or [])
        self.sent_json = []
        self.sent_text = []
        self.sent_bytes = []

    def __aiter__(self):
        self.iterator = iter(self.messages)
        return self

    async def __anext__(self):
        try:
            return next(self.iterator)
        except StopIteration as error:
            raise StopAsyncIteration from error

    async def send_json(self, payload):
        self.sent_json.append(payload)

    async def send_str(self, payload):
        self.sent_text.append(payload)

    async def send_bytes(self, payload):
        self.sent_bytes.append(payload)

    async def ping(self):
        return None


@unittest.skipUnless(aiohttp is not None, "aiohttp is installed in the Chatmgt runtime image")
class TinodeAccountBridgeTests(unittest.TestCase):
    def setUp(self):
        bridge._GROUP_SPAM_STATES.clear()
        bridge._GROUP_SPAM_LAST_PRUNE = 0.0

    def test_loads_only_valid_ice_server_records(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", delete=False) as source:
            json.dump([
                {"urls": ["stun:turn.example:3478"]},
                {"username": "missing-urls"},
                "invalid",
            ], source)
            path = source.name
        try:
            self.assertEqual(
                bridge._load_ice_servers(path),
                [{"urls": ["stun:turn.example:3478"]}],
            )
        finally:
            Path(path).unlink(missing_ok=True)

    def test_marks_relay_ice_as_non_authoritative_when_upstream_is_missing_it(self):
        ice_servers = [{"urls": ["turn:turn.example:3478"]}]
        hello = {"ctrl": {"id": "1", "code": 201, "params": {"ver": "0.25"}}}
        rewritten = bridge._rewrite_hello_response(hello, ice_servers)

        self.assertEqual(rewritten["ctrl"]["params"]["iceServers"], ice_servers)
        self.assertFalse(rewritten["ctrl"]["params"]["webrtcEnabled"])
        self.assertNotIn("iceServers", hello["ctrl"]["params"])

        upstream = {"ctrl": {"id": "1", "code": 201, "params": {"ver": "0.25", "iceServers": [{"urls": ["stun:central"]}]}}}
        upstream_rewritten = bridge._rewrite_hello_response(upstream, ice_servers)
        self.assertTrue(upstream_rewritten["ctrl"]["params"]["webrtcEnabled"])
        self.assertNotIn("webrtcEnabled", upstream["ctrl"]["params"])
        already_marked = {"ctrl": {"id": "1", "code": 201, "params": {"ver": "0.25", "iceServers": [{"urls": ["stun:central"]}], "webrtcEnabled": True}}}
        self.assertIs(bridge._rewrite_hello_response(already_marked, ice_servers), already_marked)
        login = {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrTest"}}}
        self.assertIs(bridge._rewrite_hello_response(login, ice_servers), login)
        created = {"ctrl": {"id": "3", "code": 201, "params": {"user": "usrCreated"}}}
        self.assertIs(bridge._rewrite_hello_response(created, ice_servers), created)

    def test_direct_publish_detection_does_not_touch_groups(self):
        direct = {"pub": {"id": "direct-1", "topic": "usrPeer", "content": "hello"}}
        group = {"pub": {"id": "group-1", "topic": "grpRoom", "content": "hello"}}
        self.assertIs(bridge._direct_publish(direct), direct["pub"])
        self.assertIsNone(bridge._direct_publish(group))
        self.assertIsNone(bridge._direct_publish({"note": {"topic": "usrPeer"}}))

    def test_captures_web_platform_and_detects_only_group_publishes(self):
        session_state = {}
        bridge._capture_client_platform({"hi": {"platf": "web"}}, session_state)
        group = {"pub": {"id": "group-1", "topic": "grpRoom", "content": "hello"}}
        direct = {"pub": {"id": "direct-1", "topic": "usrPeer", "content": "hello"}}

        self.assertEqual(session_state["client_platform"], "web")
        self.assertIs(bridge._group_publish(group), group["pub"])
        self.assertIsNone(bridge._group_publish(direct))

    def test_web_group_spam_doubles_then_recovers_without_touching_mobile(self):
        session_state = {"client_platform": "web", "tinode_uid": "usrSender"}

        def publish(index, now, prefix):
            return {
                "id": "{}-{}".format(prefix, index),
                "topic": "grpRoom",
                "head": {bridge.GROUP_ACTION_HEAD: "{}-{}".format(prefix, index)},
                "content": "hello",
            }, now

        for index in range(bridge.GROUP_SPAM_ACTION_LIMIT):
            packet, now = publish(index, 10 + index * 0.1, "first")
            bridge._check_group_spam_publish(session_state, packet, now=now)
        blocked_packet, blocked_at = publish(4, 10.4, "first")
        with self.assertRaises(bridge.BridgeError) as first_error:
            bridge._check_group_spam_publish(session_state, blocked_packet, now=blocked_at)
        self.assertEqual(first_error.exception.status_code, 429)
        self.assertEqual(first_error.exception.error_code, bridge.GROUP_SPAM_ERROR_CODE)
        self.assertEqual(first_error.exception.params["retry_after"], 5)

        second_start = 15.5
        for index in range(bridge.GROUP_SPAM_ACTION_LIMIT):
            packet, now = publish(index, second_start + index * 0.1, "second")
            bridge._check_group_spam_publish(session_state, packet, now=now)
        second_packet, second_at = publish(4, second_start + 0.4, "second")
        with self.assertRaises(bridge.BridgeError) as second_error:
            bridge._check_group_spam_publish(session_state, second_packet, now=second_at)
        self.assertEqual(second_error.exception.params["retry_after"], 10)

        recovered_start = second_at + 10 + bridge.GROUP_SPAM_RECOVERY_SECONDS + 0.1
        for index in range(bridge.GROUP_SPAM_ACTION_LIMIT):
            packet, now = publish(index, recovered_start + index * 0.1, "recovered")
            bridge._check_group_spam_publish(session_state, packet, now=now)
        recovered_packet, recovered_at = publish(4, recovered_start + 0.4, "recovered")
        with self.assertRaises(bridge.BridgeError) as recovered_error:
            bridge._check_group_spam_publish(session_state, recovered_packet, now=recovered_at)
        self.assertEqual(recovered_error.exception.params["retry_after"], 5)

        mobile_state = {"client_platform": "android", "tinode_uid": "usrMobile"}
        for index in range(bridge.GROUP_SPAM_ACTION_LIMIT + 5):
            packet, now = publish(index, 100 + index * 0.01, "mobile")
            bridge._check_group_spam_publish(mobile_state, packet, now=now)
        self.assertNotIn(("usrMobile", "grpRoom"), bridge._GROUP_SPAM_STATES)

    def test_one_multi_file_group_action_is_counted_once(self):
        session_state = {"client_platform": "web", "tinode_uid": "usrBatch"}
        for index in range(20):
            bridge._check_group_spam_publish(session_state, {
                "id": "batch-packet-{}".format(index),
                "topic": "grpRoom",
                "head": {bridge.GROUP_ACTION_HEAD: "batch-one"},
                "content": "attachment",
            }, now=20 + index * 0.01)

        state = bridge._GROUP_SPAM_STATES[("usrBatch", "grpRoom")]
        self.assertEqual(len(state["action_times"]), 1)
        self.assertEqual(state["recent_actions"]["batch-one"]["repeats"], 20)

    def test_group_management_announcements_do_not_consume_message_spam_budget(self):
        session_state = {"client_platform": "web", "tinode_uid": "usrAdmin"}
        for index in range(bridge.GROUP_SPAM_ACTION_LIMIT + 3):
            bridge._check_group_spam_publish(session_state, {
                "id": "rename-{}".format(index),
                "topic": "grpRoom",
                "content": "{}{}".format(
                    bridge.SYSTEM_EVENT_PREFIX,
                    json.dumps({"action": "group_name_changed"}),
                ),
            }, now=30 + index * 0.01)

        self.assertNotIn(("usrAdmin", "grpRoom"), bridge._GROUP_SPAM_STATES)
        bridge._check_group_spam_publish(session_state, {
            "id": "pin-one",
            "topic": "grpRoom",
            "content": "{}{}".format(
                bridge.SYSTEM_EVENT_PREFIX,
                json.dumps({"action": "message_pinned"}),
            ),
        }, now=31)
        self.assertEqual(len(bridge._GROUP_SPAM_STATES[("usrAdmin", "grpRoom")]["action_times"]), 1)


@unittest.skipUnless(aiohttp is not None, "aiohttp is installed in the Chatmgt runtime image")
class TinodeAccountBridgeAsyncTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        bridge._GROUP_SPAM_STATES.clear()
        bridge._GROUP_SPAM_LAST_PRUNE = 0.0

    @staticmethod
    def message(packet):
        return type("Message", (), {
            "type": bridge.aiohttp.WSMsgType.TEXT,
            "data": json.dumps(packet),
        })()

    async def test_allowed_direct_publish_is_forwarded_after_policy_check(self):
        client = FakeWebSocket([self.message({"pub": {
            "id": "direct-1",
            "topic": "usrPeer",
            "content": "hello",
        }})])
        upstream = FakeWebSocket()
        policy = FakePolicySession([
            FakePolicyResponse(payload={"managed": True, "allowed": True}),
        ])

        await bridge._relay_client_to_tinode(
            client,
            upstream,
            False,
            policy,
            {"tinode_uid": "usrSender"},
        )

        self.assertEqual(len(upstream.sent_json), 1)
        self.assertEqual(upstream.sent_json[0]["pub"]["topic"], "usrPeer")
        self.assertEqual(policy.calls[0][1]["json"], {
            "sender_uid": "usrSender",
            "topic": "usrPeer",
        })
        self.assertEqual(client.sent_json, [])

    async def test_every_blocked_direct_publish_is_rejected_and_never_forwarded(self):
        packets = [
            {"pub": {"id": "direct-1", "topic": "usrPeer", "content": "one"}},
            {"pub": {"id": "direct-2", "topic": "usrPeer", "content": "two"}},
        ]
        client = FakeWebSocket([self.message(packet) for packet in packets])
        upstream = FakeWebSocket()
        policy = FakePolicySession([
            FakePolicyResponse(payload={"allowed": False, "errorCode": "DIRECT_MESSAGE_BLOCKED"}),
            FakePolicyResponse(payload={"allowed": False, "errorCode": "DIRECT_MESSAGE_BLOCKED"}),
        ])

        await bridge._relay_client_to_tinode(
            client,
            upstream,
            False,
            policy,
            {"tinode_uid": "usrSender"},
        )

        self.assertEqual(upstream.sent_json, [])
        self.assertEqual(len(client.sent_json), 2)
        for request_id, response in zip(("direct-1", "direct-2"), client.sent_json):
            self.assertEqual(response["ctrl"]["id"], request_id)
            self.assertEqual(response["ctrl"]["code"], 403)
            self.assertEqual(response["ctrl"]["params"]["error_code"], "DIRECT_MESSAGE_BLOCKED")
            self.assertEqual(response["ctrl"]["text"], bridge.DIRECT_MESSAGE_BLOCKED_TEXT)

    async def test_group_publish_bypasses_direct_policy(self):
        packet = {"pub": {"id": "group-1", "topic": "grpRoom", "content": "hello group"}}
        client = FakeWebSocket([self.message(packet)])
        upstream = FakeWebSocket()

        await bridge._relay_client_to_tinode(client, upstream, False, None, {})

        self.assertEqual(upstream.sent_json, [packet])
        self.assertEqual(client.sent_json, [])

    async def test_web_group_spam_is_rejected_before_tinode(self):
        packets = [{"hi": {"id": "hi-1", "platf": "web"}}]
        packets.extend({"pub": {
            "id": "group-{}".format(index),
            "topic": "grpRoom",
            "head": {bridge.GROUP_ACTION_HEAD: "action-{}".format(index)},
            "content": "hello group",
        }} for index in range(bridge.GROUP_SPAM_ACTION_LIMIT + 1))
        client = FakeWebSocket([self.message(packet) for packet in packets])
        upstream = FakeWebSocket()

        await bridge._relay_client_to_tinode(
            client,
            upstream,
            False,
            None,
            {"tinode_uid": "usrSender"},
        )

        self.assertEqual(len(upstream.sent_json), bridge.GROUP_SPAM_ACTION_LIMIT + 1)
        self.assertEqual(upstream.sent_json[0]["hi"]["platf"], "web")
        self.assertEqual(len(client.sent_json), 1)
        rejection = client.sent_json[0]["ctrl"]
        self.assertEqual(rejection["id"], "group-4")
        self.assertEqual(rejection["code"], 429)
        self.assertEqual(rejection["params"]["error_code"], bridge.GROUP_SPAM_ERROR_CODE)
        self.assertEqual(rejection["params"]["retry_after"], 5)

    async def test_mobile_and_trusted_internal_group_publishes_remain_unchanged(self):
        mobile_packets = [{"hi": {"id": "hi-mobile", "platf": "android"}}]
        mobile_packets.extend({"pub": {
            "id": "mobile-{}".format(index),
            "topic": "grpRoom",
            "content": "hello group",
        }} for index in range(bridge.GROUP_SPAM_ACTION_LIMIT + 3))
        mobile_client = FakeWebSocket([self.message(packet) for packet in mobile_packets])
        mobile_upstream = FakeWebSocket()
        await bridge._relay_client_to_tinode(
            mobile_client,
            mobile_upstream,
            False,
            None,
            {"tinode_uid": "usrMobile"},
        )
        self.assertEqual(mobile_upstream.sent_json, mobile_packets)
        self.assertEqual(mobile_client.sent_json, [])

        internal_packets = [{"pub": {
            "id": "internal-{}".format(index),
            "topic": "grpRoom",
            "content": "system event",
        }} for index in range(bridge.GROUP_SPAM_ACTION_LIMIT + 3)]
        internal_client = FakeWebSocket([self.message(packet) for packet in internal_packets])
        internal_upstream = FakeWebSocket()
        await bridge._relay_client_to_tinode(
            internal_client,
            internal_upstream,
            True,
            None,
            {"client_platform": "web", "tinode_uid": "usrInternal"},
        )
        self.assertEqual(internal_upstream.sent_json, internal_packets)
        self.assertEqual(internal_client.sent_json, [])

    async def test_trusted_internal_direct_publish_remains_unchanged(self):
        packet = {"pub": {"id": "direct-internal", "topic": "usrPeer", "content": "internal"}}
        client = FakeWebSocket([self.message(packet)])
        upstream = FakeWebSocket()

        await bridge._relay_client_to_tinode(client, upstream, True, None, {})

        self.assertEqual(upstream.sent_json, [packet])
        self.assertEqual(client.sent_json, [])

    async def test_direct_policy_failure_is_closed_before_forwarding(self):
        packet = {"pub": {"id": "direct-closed", "topic": "usrPeer", "content": "hello"}}
        client = FakeWebSocket([self.message(packet)])
        upstream = FakeWebSocket()
        policy = FakePolicySession([FakePolicyResponse(status=503, payload={})])

        await bridge._relay_client_to_tinode(
            client,
            upstream,
            False,
            policy,
            {"tinode_uid": "usrSender"},
        )

        self.assertEqual(upstream.sent_json, [])
        self.assertEqual(client.sent_json[0]["ctrl"]["code"], 503)
        self.assertEqual(
            client.sent_json[0]["ctrl"]["params"]["error_code"],
            "DIRECT_MESSAGE_POLICY_UNAVAILABLE",
        )


if __name__ == "__main__":
    unittest.main()
