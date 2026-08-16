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


@unittest.skipUnless(aiohttp is not None, "aiohttp is installed in the Chatmgt runtime image")
class TinodeAccountBridgeTests(unittest.TestCase):
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

        upstream = {"ctrl": {"id": "1", "code": 201, "params": {"iceServers": [{"urls": ["stun:central"]}]}}}
        upstream_rewritten = bridge._rewrite_hello_response(upstream, ice_servers)
        self.assertTrue(upstream_rewritten["ctrl"]["params"]["webrtcEnabled"])
        self.assertNotIn("webrtcEnabled", upstream["ctrl"]["params"])
        already_marked = {"ctrl": {"id": "1", "code": 201, "params": {"iceServers": [{"urls": ["stun:central"]}], "webrtcEnabled": True}}}
        self.assertIs(bridge._rewrite_hello_response(already_marked, ice_servers), already_marked)
        login = {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrTest"}}}
        self.assertIs(bridge._rewrite_hello_response(login, ice_servers), login)
        created = {"ctrl": {"id": "3", "code": 201, "params": {"user": "usrCreated"}}}
        self.assertIs(bridge._rewrite_hello_response(created, ice_servers), created)


if __name__ == "__main__":
    unittest.main()
