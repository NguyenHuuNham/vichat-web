import importlib.util
import base64
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, call, patch


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

    async def test_topic_member_access_includes_effective_granted_and_wanted_modes(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"meta": {"id": "4", "topic": "grpRoom", "sub": [
                {"user": "usrOwner", "acs": {"want": "JRWPASO", "given": "JRWPASDO", "mode": "JRWPASO"}},
                {"user": "usrMember", "acs": {"want": "JRWPAS", "given": "PAS", "mode": "PAS"}},
            ]}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            access = await auth_service.tinode_topic_member_access(
                "short-token",
                "usrOwner",
                "grpRoom",
            )

        self.assertEqual(access["usrOwner"]["mode"], "JRWPASO")
        self.assertEqual(access["usrMember"], {
            "mode": "PAS",
            "given": "PAS",
            "want": "JRWPAS",
        })

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

    async def test_topic_member_reconciliation_removes_stale_tinode_subscriber(self):
        observed = AsyncMock(side_effect=[
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASO", "want": "JRWPASO"},
                "usrMember": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
                "usrStale": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASO", "want": "JRWPASO"},
                "usrMember": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_remove_topic_member",
            AsyncMock(),
        ) as remove:
            members = await auth_service.tinode_reconcile_topic_members(
                "short-token",
                "usrOwner",
                "grpRoom",
                {"usrOwner", "usrMember"},
            )

        self.assertEqual(members, {"usrOwner", "usrMember"})
        remove.assert_awaited_once_with(
            "short-token",
            "usrOwner",
            "grpRoom",
            "usrStale",
        )

    async def test_topic_member_reconciliation_adds_missing_access_without_removing_permissions(self):
        observed = AsyncMock(side_effect=[
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrMember": {"mode": "PAS", "given": "PAS", "want": "JRWPAS"},
            },
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrMember": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_add_topic_members",
            AsyncMock(),
        ) as add, patch.object(
            auth_service,
            "tinode_accept_topic_access",
            AsyncMock(),
        ) as accept, patch.object(
            auth_service,
            "tinode_remove_topic_member",
            AsyncMock(),
        ) as remove:
            members = await auth_service.tinode_reconcile_topic_members(
                "owner-token",
                "usrOwner",
                "grpRoom",
                {"usrOwner", "usrMember"},
                member_tokens={"usrMember": "member-token"},
            )

        self.assertEqual(members, {"usrOwner", "usrMember"})
        add.assert_awaited_once_with(
            "owner-token",
            "usrOwner",
            "grpRoom",
            ["usrMember"],
            mode="JRWPAS",
        )
        accept.assert_not_awaited()
        remove.assert_not_awaited()

    async def test_topic_member_reconciliation_repairs_the_members_requested_mode(self):
        observed = AsyncMock(side_effect=[
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrMember": {"mode": "PAS", "given": "JRWPAS", "want": "PAS"},
            },
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrMember": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_add_topic_members",
            AsyncMock(),
        ) as add, patch.object(
            auth_service,
            "tinode_accept_topic_access",
            AsyncMock(),
        ) as accept:
            await auth_service.tinode_reconcile_topic_members(
                "owner-token",
                "usrOwner",
                "grpRoom",
                {"usrOwner", "usrMember"},
                member_tokens={"usrMember": "member-token"},
            )

        add.assert_not_awaited()
        accept.assert_awaited_once_with(
            "member-token",
            "usrMember",
            "grpRoom",
            mode="JRWPAS",
        )

    async def test_topic_member_reconciliation_repairs_deputy_with_a_complete_mode(self):
        observed = AsyncMock(side_effect=[
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrDeputy": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
            {
                "usrOwner": {"mode": "JRWPASO", "given": "JRWPASDO", "want": "JRWPASO"},
                "usrDeputy": {"mode": "JRWPASD", "given": "JRWPASD", "want": "JRWPASD"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_add_topic_members",
            AsyncMock(),
        ) as add, patch.object(
            auth_service,
            "tinode_accept_topic_access",
            AsyncMock(),
        ) as accept:
            await auth_service.tinode_reconcile_topic_members(
                "owner-token",
                "usrOwner",
                "grpRoom",
                {"usrOwner", "usrDeputy"},
                expected_access_modes={"usrDeputy": "JRWPASD"},
                member_tokens={"usrDeputy": "deputy-token"},
            )

        add.assert_awaited_once_with(
            "owner-token",
            "usrOwner",
            "grpRoom",
            ["usrDeputy"],
            mode="JRWPASD",
        )
        accept.assert_awaited_once_with(
            "deputy-token",
            "usrDeputy",
            "grpRoom",
            mode="JRWPASD",
        )

    async def test_topic_member_reconciliation_can_scope_access_checks_to_new_members(self):
        observed = AsyncMock(side_effect=[
            {
                "usrLegacyOwner": {"mode": "PAS", "given": "PAS", "want": "PAS"},
                "usrActor": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
                "usrNew": {"mode": "PAS", "given": "PAS", "want": "JRWPAS"},
            },
            {
                "usrLegacyOwner": {"mode": "PAS", "given": "PAS", "want": "PAS"},
                "usrActor": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
                "usrNew": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_add_topic_members",
            AsyncMock(),
        ) as add, patch.object(
            auth_service,
            "tinode_accept_topic_access",
            AsyncMock(),
        ) as accept, patch.object(
            auth_service,
            "tinode_remove_topic_member",
            AsyncMock(),
        ) as remove:
            members = await auth_service.tinode_reconcile_topic_members(
                "actor-token",
                "usrActor",
                "grpRoom",
                {"usrLegacyOwner", "usrActor", "usrNew"},
                expected_access_modes={
                    "usrLegacyOwner": "JRWPASO",
                    "usrActor": "JRWPAS",
                    "usrNew": "JRWPAS",
                },
                member_tokens={"usrNew": "new-token"},
                access_scope_uids={"usrNew"},
                remove_extra_members=False,
            )

        self.assertEqual(members, {"usrLegacyOwner", "usrActor", "usrNew"})
        add.assert_awaited_once_with(
            "actor-token",
            "usrActor",
            "grpRoom",
            ["usrNew"],
            mode="JRWPAS",
        )
        accept.assert_not_awaited()
        remove.assert_not_awaited()

    async def test_scoped_add_does_not_restore_unrelated_missing_legacy_members(self):
        observed = AsyncMock(side_effect=[
            {
                "usrActor": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
            {
                "usrActor": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
                "usrNew": {"mode": "JRWPAS", "given": "JRWPAS", "want": "JRWPAS"},
            },
        ])
        with patch.object(auth_service, "tinode_topic_member_access", observed), patch.object(
            auth_service,
            "tinode_add_topic_members",
            AsyncMock(),
        ) as add, patch.object(
            auth_service,
            "tinode_accept_topic_access",
            AsyncMock(),
        ) as accept, patch.object(
            auth_service,
            "tinode_remove_topic_member",
            AsyncMock(),
        ) as remove:
            members = await auth_service.tinode_reconcile_topic_members(
                "actor-token",
                "usrActor",
                "grpRoom",
                {"usrLegacyOwner", "usrActor", "usrNew"},
                expected_access_modes={
                    "usrLegacyOwner": "JRWPASO",
                    "usrActor": "JRWPAS",
                    "usrNew": "JRWPAS",
                },
                member_tokens={"usrNew": "new-token"},
                access_scope_uids={"usrNew"},
                remove_extra_members=False,
            )

        self.assertEqual(members, {"usrActor", "usrNew"})
        add.assert_awaited_once_with(
            "actor-token",
            "usrActor",
            "grpRoom",
            ["usrNew"],
            mode="JRWPAS",
        )
        accept.assert_awaited_once_with(
            "new-token",
            "usrNew",
            "grpRoom",
            mode="JRWPAS",
        )
        remove.assert_not_awaited()

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

    async def test_add_member_treats_an_existing_tinode_subscription_as_success(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 304, "text": "not modified"}},
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

    async def test_add_member_reports_only_new_subscriptions_for_safe_rollback(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 200}},
            {"ctrl": {"id": "5", "code": 200}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            updated, created = await auth_service.tinode_add_topic_members(
                "short-token",
                "usrOwner",
                "grpRoom",
                ["usrExisting", "usrCreated"],
                return_created=True,
                known_existing_member_uids={"usrExisting"},
            )

        self.assertEqual(updated, ["usrExisting", "usrCreated"])
        self.assertEqual(created, ["usrCreated"])

    async def test_add_member_does_not_roll_back_an_existing_subscription_after_later_failure(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 200}},
            {"ctrl": {"id": "5", "code": 403, "text": "permission denied"}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            with self.assertRaises(auth_service.AuthError):
                await auth_service.tinode_add_topic_members(
                    "short-token",
                    "usrOwner",
                    "grpRoom",
                    ["usrExisting", "usrRejected"],
                    known_existing_member_uids={"usrExisting"},
                )

        self.assertFalse(any("del" in packet for packet in socket.sent))

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
        self.assertEqual(socket.sent[-2]["sub"]["set"], {
            "sub": {"mode": "JRWPASO"},
        })

    async def test_existing_member_access_acceptance_treats_not_modified_as_success(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrMember"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 304, "text": "not modified"}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            result = await auth_service.tinode_accept_topic_access(
                "member-token",
                "usrMember",
                "grpRoom",
            )

        self.assertEqual(result["code"], 304)
        self.assertEqual(socket.sent[-2]["sub"]["set"]["sub"]["mode"], "JRWPAS")
        self.assertEqual(socket.sent[-1]["set"]["sub"]["mode"], "JRWPAS")

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

    async def test_dissolve_removes_non_owners_before_the_owner(self):
        remove_member = AsyncMock()
        with patch.object(auth_service, "tinode_remove_topic_member", remove_member):
            removed = await auth_service.tinode_dissolve_topic(
                "short-token",
                "usrOwner",
                "grpRoom",
                ["usrOwner", "usrMember", "usrOther", "usrMember"],
            )

        self.assertEqual(removed, ["usrMember", "usrOther", "usrOwner"])
        self.assertEqual(
            [call.args[3] for call in remove_member.await_args_list],
            ["usrMember", "usrOther", "usrOwner"],
        )

    async def test_remove_member_treats_an_already_missing_subscription_as_success(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"ctrl": {"id": "4", "code": 404, "text": "subscription not found"}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            removed = await auth_service.tinode_remove_topic_member(
                "short-token",
                "usrOwner",
                "grpRoom",
                "usrMember",
            )

        self.assertEqual(removed, "usrMember")

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

    async def test_history_window_pages_from_tinode_and_deduplicates_sequences(self):
        first_page = [
            {"topic": "grpRoom", "seq": sequence, "from": "usrMember", "ts": "2026-08-23T10:00:00Z", "content": "message"}
            for sequence in range(40, 20, -1)
        ]
        second_page = [
            {"topic": "grpRoom", "seq": sequence, "from": "usrMember", "ts": "2026-08-23T09:00:00Z", "content": "message"}
            for sequence in [21, *range(20, 1, -1)]
        ]
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"meta": {"id": "4", "topic": "grpRoom", "data": first_page}},
            {"ctrl": {"id": "4", "code": 200, "params": {"count": 20}}},
            {"meta": {"id": "5", "topic": "grpRoom", "data": second_page}},
            {"ctrl": {"id": "5", "code": 200, "params": {"count": 20}}},
            {"meta": {"id": "6", "topic": "grpRoom", "data": []}},
            {"ctrl": {"id": "6", "code": 200, "params": {"count": 0}}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            result = await auth_service.tinode_history_window(
                "short-token",
                "usrOwner",
                "grpRoom",
                page_limit=20,
            )

        self.assertEqual(len(result["messages"]), 39)
        self.assertEqual({message["seq"] for message in result["messages"]}, set(range(2, 41)))
        self.assertFalse(result["has_more"])
        self.assertIsNone(result["next_cursor"])
        self.assertEqual(socket.sent[4]["get"]["data"]["before"], 21)
        self.assertEqual(socket.sent[5]["get"]["data"]["before"], 2)

    async def test_history_window_honors_a_cursor_and_stops_on_an_empty_page(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOwner"}}},
            {"ctrl": {"id": "3", "code": 200}},
            {"meta": {"id": "4", "topic": "grpRoom", "data": [
                {"topic": "grpRoom", "seq": 8, "from": "usrMember", "content": "old"},
            ]}},
            {"ctrl": {"id": "4", "code": 200, "params": {"count": 1}}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            result = await auth_service.tinode_history_window(
                "short-token",
                "usrOwner",
                "grpRoom",
                before=9,
            )

        self.assertEqual([message["seq"] for message in result["messages"]], [8])
        self.assertFalse(result["has_more"])
        self.assertEqual(socket.sent[-1]["get"]["data"]["before"], 9)

    async def test_history_window_rejects_a_token_for_another_user(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 200, "params": {"user": "usrOther"}}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            with self.assertRaises(auth_service.AuthError) as raised:
                await auth_service.tinode_history_window("short-token", "usrOwner", "grpRoom")

        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(len(socket.sent), 2)

    async def test_history_window_maps_expired_tokens_to_unauthorized(self):
        socket = FakeSocket([
            {"ctrl": {"id": "1", "code": 201}},
            {"ctrl": {"id": "2", "code": 401, "text": "token expired"}},
        ])
        with self.config(), patch.object(
            auth_service.aiohttp,
            "ClientSession",
            self.client_session(socket),
        ):
            with self.assertRaises(auth_service.AuthError) as raised:
                await auth_service.tinode_history_window("expired-token", "usrOwner", "grpRoom")

        self.assertEqual(raised.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
