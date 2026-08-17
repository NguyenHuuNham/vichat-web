import importlib.util
import base64
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch


HAS_RUNTIME_DEPENDENCIES = all(
    importlib.util.find_spec(name) is not None
    for name in ("aiohttp", "bcrypt")
)

PROJECT_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = PROJECT_ROOT / "application" / "services" / "auth_service.py"
auth_service = None
if HAS_RUNTIME_DEPENDENCIES:
    fake_app = types.SimpleNamespace(config={})
    database_module = types.ModuleType("application.database")
    database_module.redisdb = None
    application_module = types.ModuleType("application")
    application_module.__path__ = []
    application_module.database = database_module
    services_module = types.ModuleType("application.services")
    services_module.__path__ = []
    server_module = types.ModuleType("application.server")
    server_module.app = fake_app
    identity_module = types.ModuleType("application.services.sso_identity")
    identity_module.SSOIdentityError = ValueError
    identity_module.derive_tinode_password = lambda *_args: "unused-derived-password"
    replacements = {
        "application": application_module,
        "application.database": database_module,
        "application.server": server_module,
        "application.services": services_module,
        "application.services.sso_identity": identity_module,
    }
    previous_modules = {name: sys.modules.get(name) for name in replacements}
    sys.modules.update(replacements)
    try:
        spec = importlib.util.spec_from_file_location("tinode_auth_service", MODULE_PATH)
        auth_service = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(auth_service)
    finally:
        for name, previous in previous_modules.items():
            if previous is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = previous


class FakeSocket:
    def __init__(self, packets):
        self.packets = list(packets)
        self.sent = []

    async def send_json(self, packet):
        self.sent.append(packet)

    async def receive_json(self):
        if not self.packets:
            raise AssertionError("The bridge requested an unexpected Tinode packet.")
        return self.packets.pop(0)


class FakeSocketContext:
    def __init__(self, socket):
        self.socket = socket

    async def __aenter__(self):
        return self.socket

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False


class FakeClientSession:
    def __init__(self, socket, **_kwargs):
        self.socket = socket

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False

    def ws_connect(self, _url, **_kwargs):
        return FakeSocketContext(self.socket)


@unittest.skipUnless(
    HAS_RUNTIME_DEPENDENCIES,
    "Tinode bridge service dependencies are installed in the Chatmgt runtime image",
)
class TinodeBridgeServiceTests(unittest.IsolatedAsyncioTestCase):
    def client_session(self, socket):
        return lambda **kwargs: FakeClientSession(socket, **kwargs)

    def config(self):
        return patch.dict(auth_service.app.config, {
            "TINODE_INTERNAL_WS_URL": "ws://chatapi:6060/v0/channels",
            "TINODE_API_KEY": "test-api-key",
            "TINODE_AUTH_TIMEOUT": 10,
        })

    async def test_sso_login_does_not_require_admin_when_credential_is_valid(self):
        identity = {
            "tenant_id": "tenant-a",
            "account_user_id": "account-a",
            "full_name": "Account A",
        }
        expected = {"uid": "usrAccountA", "token": "short-token"}
        with patch.object(
            auth_service,
            "tinode_sso_password",
            return_value="derived-password",
        ), patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(return_value=expected),
        ) as login, patch.object(
            auth_service,
            "tinode_admin_reset_password",
            AsyncMock(),
        ) as reset:
            result = await auth_service.tinode_sso_login(
                identity,
                "vichat_account_a",
                "usrAccountA",
            )

        self.assertEqual(result, expected)
        login.assert_awaited_once_with("vichat_account_a", "derived-password")
        reset.assert_not_awaited()

    async def test_mirror_login_uses_the_chatmgt_password_for_an_existing_uid(self):
        expected = {"uid": "usrAccountA", "token": "short-token", "expires": "2099-01-01T00:00:00Z"}
        with patch.dict(auth_service.app.config, {"TINODE_MIRROR_LOCAL_CREDENTIALS": True}), patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(return_value=expected),
        ) as login, patch.object(
            auth_service,
            "tinode_admin_reset_password",
            AsyncMock(),
        ) as reset:
            result = await auth_service.tinode_mirror_login(
                "nham",
                "employee-password",
                "Nham",
                tinode_uid="usrAccountA",
                legacy_username="nham",
            )

        self.assertEqual(result["username"], "nham")
        login.assert_awaited_once_with("nham", "employee-password")
        reset.assert_not_awaited()

    async def test_mirror_login_repairs_a_legacy_uid_in_place(self):
        expected = {"uid": "usrAccountA", "token": "short-token"}
        with patch.dict(auth_service.app.config, {"TINODE_MIRROR_LOCAL_CREDENTIALS": True}), patch.object(
            auth_service,
            "tinode_admin_reset_password",
            AsyncMock(),
        ) as reset, patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(side_effect=[
                auth_service.AuthError("rejected", 401),
                expected,
            ]),
        ) as login, patch.object(
            auth_service,
            "tinode_change_password",
            AsyncMock(return_value={"uid": "usrAccountA", "username": "nham"}),
        ) as change:
            result = await auth_service.tinode_mirror_login(
                "nham",
                "employee-password",
                "Nham",
                tinode_uid="usrAccountA",
                legacy_username="upgo_legacy",
                legacy_password="derived-password",
            )

        self.assertEqual(result["uid"], "usrAccountA")
        self.assertEqual(login.await_count, 2)
        change.assert_awaited_once_with(
            "upgo_legacy",
            "derived-password",
            "employee-password",
            new_username="nham",
        )
        reset.assert_not_awaited()

    async def test_mirror_login_adopts_an_existing_basic_account_without_a_mapping(self):
        expected = {"uid": "usrExisting", "token": "short-token"}
        with patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(return_value=expected),
        ) as login, patch.object(
            auth_service,
            "tinode_create_account",
            AsyncMock(),
        ) as create:
            result = await auth_service.tinode_mirror_login(
                "nham",
                "employee-password",
                "Nham",
            )

        self.assertEqual(result["uid"], "usrExisting")
        self.assertEqual(result["username"], "nham")
        login.assert_awaited_once_with("nham", "employee-password")
        create.assert_not_awaited()

    async def test_mirror_login_rejects_a_duplicate_basic_account_for_another_uid(self):
        with patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(return_value={"uid": "usrDuplicate", "token": "short-token"}),
        ), patch.object(
            auth_service,
            "tinode_change_password",
            AsyncMock(),
        ) as change, patch.object(
            auth_service,
            "tinode_admin_reset_password",
            AsyncMock(),
        ) as reset:
            with self.assertRaises(auth_service.AuthError) as raised:
                await auth_service.tinode_mirror_login(
                    "nham",
                    "employee-password",
                    "Nham",
                    tinode_uid="usrMapped",
                    legacy_username="upgo_legacy",
                    legacy_password="derived-password",
                )

        self.assertEqual(raised.exception.status_code, 409)
        change.assert_not_awaited()
        reset.assert_not_awaited()

    async def test_change_password_can_replace_the_basic_login_on_the_same_uid(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrAccountA"}}},
            {"ctrl": {"id": "3", "code": 200}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            result = await auth_service.tinode_change_password(
                "upgo_legacy",
                "derived-password",
                "employee-password",
                new_username="nham",
            )

        self.assertEqual(result, {"uid": "usrAccountA", "username": "nham"})
        encoded_secret = socket.sent[2]["acc"]["secret"]
        self.assertEqual(
            base64.b64decode(encoded_secret).decode("utf-8"),
            "nham:employee-password",
        )

    async def test_sso_login_uses_admin_only_to_repair_rejected_credential(self):
        identity = {
            "tenant_id": "tenant-a",
            "account_user_id": "account-a",
            "full_name": "Account A",
        }
        expected = {"uid": "usrAccountA", "token": "short-token"}
        with patch.object(
            auth_service,
            "tinode_sso_password",
            return_value="derived-password",
        ), patch.object(
            auth_service,
            "tinode_login",
            AsyncMock(side_effect=[
                auth_service.AuthError("rejected", 401),
                expected,
            ]),
        ) as login, patch.object(
            auth_service,
            "tinode_admin_reset_password",
            AsyncMock(),
        ) as reset:
            result = await auth_service.tinode_sso_login(
                identity,
                "vichat_account_a",
                "usrAccountA",
            )

        self.assertEqual(result, expected)
        self.assertEqual(login.await_count, 2)
        reset.assert_awaited_once_with(
            "vichat_account_a",
            "usrAccountA",
            "derived-password",
        )

    async def test_group_binding_requires_exact_chatmgt_members(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"meta": {"id": "4", "topic": "grpRoom", "sub": [
                {"user": "usrOwner"},
                {"user": "usrMember"},
            ]}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            members = await auth_service.tinode_verify_topic_access(
                "short-token",
                "usrOwner",
                "grpRoom",
                expected_member_uids={"usrOwner", "usrMember"},
            )

        self.assertEqual(members, {"usrOwner", "usrMember"})
        self.assertEqual(socket.sent[-1]["get"]["what"], "sub")

    async def test_group_binding_rejects_an_extra_tinode_subscriber(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"meta": {"id": "4", "topic": "grpRoom", "sub": [
                {"user": "usrOwner"},
                {"user": "usrMember"},
                {"user": "usrForeign"},
            ]}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            with self.assertRaises(auth_service.AuthError) as raised:
                await auth_service.tinode_verify_topic_access(
                    "short-token",
                    "usrOwner",
                    "grpRoom",
                    expected_member_uids={"usrOwner", "usrMember"},
                )

        self.assertEqual(raised.exception.status_code, 409)

    async def test_add_member_uses_the_authenticated_owner_token(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 200}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            added = await auth_service.tinode_add_topic_members(
                "short-token",
                "usrOwner",
                "grpRoom",
                ["usrMember"],
            )

        self.assertEqual(added, ["usrMember"])
        self.assertEqual(socket.sent[-1]["set"]["sub"], {
            "user": "usrMember",
            "mode": "JRWPAS",
        })

    async def test_owner_transfer_is_accepted_by_the_replacement_user(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrMember"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 200}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            await auth_service.tinode_accept_topic_owner(
                "replacement-token",
                "usrMember",
                "grpRoom",
            )

        self.assertEqual(socket.sent[-1]["set"], {
            "id": "4",
            "topic": "grpRoom",
            "sub": {"mode": "JRWPASO"},
        })

    async def test_group_leave_event_is_published_by_a_surviving_user(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrMember"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "3", "code": 200, "params": {"seq": 44}}},
        ])
        event = {
            "action": "member_left",
            "actorId": "acctOwner",
            "actorName": "Owner",
        }
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            await auth_service.tinode_publish_system_event(
                "replacement-token",
                "usrMember",
                "grpRoom",
                event,
            )

        content = socket.sent[-1]["pub"]["content"]
        self.assertTrue(content.startswith("__VICHAT_SYSTEM_EVENT__:"))
        self.assertEqual(
            json.loads(content.split(":", 1)[1]),
            event,
        )

    async def test_self_removal_unsubscribes_the_current_tinode_user(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 200}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            await auth_service.tinode_remove_topic_member(
                "short-token",
                "usrOwner",
                "grpRoom",
                "usrOwner",
            )

        self.assertEqual(socket.sent[-1]["leave"], {
            "id": "4",
            "topic": "grpRoom",
            "unsub": True,
        })

    async def test_account_creation_preserves_server_failure_instead_of_retrying_as_conflict(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 500, "text": "database value is too long"}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            with self.assertRaises(auth_service.AuthError) as raised:
                await auth_service.tinode_create_account(
                    "upgo_short_login",
                    "derived-password",
                    "Account User",
                )

        self.assertEqual(raised.exception.status_code, 502)
        self.assertEqual(str(raised.exception), "database value is too long")


if __name__ == "__main__":
    unittest.main()
