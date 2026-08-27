import ast
import unittest
from pathlib import Path
from types import SimpleNamespace


CONTROLLER_PATH = (
    Path(__file__).resolve().parents[1]
    / "application"
    / "controllers"
    / "api_chat_management.py"
)


def isolated_function(path, name, namespace=None):
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    function = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == name
    )
    scope = dict(namespace or {})
    exec(compile(ast.Module(body=[function], type_ignores=[]), str(path), "exec"), scope)
    return scope[name]


class Column:
    def __eq__(self, _value):
        return object()

    def contains(self, _value):
        return object()


class Query:
    def __init__(self, values):
        self.values = list(values)

    def filter(self, *_conditions):
        return self

    def all(self):
        return list(self.values)


class DirectoryReconciliationTests(unittest.TestCase):
    def test_authoritative_snapshot_retires_only_omitted_account_projection(self):
        kept = SimpleNamespace(
            id="account-kept",
            username="kept.user",
            email="kept@example.vn",
            active=True,
            tinode_uid="usrKept123",
            updated_at=10,
            properties={
                "auth_source": "account",
                "account_user_id": "account-user-kept",
                "auth_version": 2,
            },
        )
        omitted = SimpleNamespace(
            id="account-omitted",
            username="replacement.user",
            email="replacement@example.vn",
            active=True,
            tinode_uid="usrOmitted123",
            updated_at=20,
            properties={
                "auth_source": "account",
                "account_user_id": "account-user-omitted",
                "auth_version": 4,
            },
        )
        already_inactive = SimpleNamespace(
            id="account-inactive",
            username="inactive.user",
            email="inactive@example.vn",
            active=False,
            tinode_uid="usrInactive123",
            updated_at=30,
            properties={
                "auth_source": "account",
                "account_user_id": "account-user-inactive",
                "auth_version": 7,
            },
        )
        column = Column()
        deactivate = isolated_function(CONTROLLER_PATH, "_deactivate_missing_account_projections", {
            "ManagementAccount": SimpleNamespace(
                query=Query([kept, omitted, already_inactive]),
                tenant_id=column,
                properties=column,
            ),
            "time": SimpleNamespace(time=lambda: 1700000000),
            "_directory_removed_username": (
                lambda tenant_id, account_id: "removed-{}-{}".format(tenant_id, account_id)
            ),
        })

        deactivated, released = deactivate("tenant-a", [
            {
                "account_user_id": "account-user-kept",
                "username": "kept.user",
                "email": "kept@example.vn",
            },
            {
                "account_user_id": "account-user-replacement",
                "username": "replacement.user",
                "email": "replacement@example.vn",
            },
        ])

        self.assertEqual((deactivated, released), (1, 1))
        self.assertTrue(kept.active)
        self.assertEqual(kept.properties["auth_version"], 2)
        self.assertFalse(omitted.active)
        self.assertEqual(omitted.properties["auth_version"], 5)
        self.assertEqual(omitted.properties["directory_removed_at"], 1700000000)
        self.assertTrue(omitted.properties["directory_identity_released"])
        self.assertEqual(omitted.username, "removed-tenant-a-account-omitted")
        self.assertIsNone(omitted.email)
        self.assertEqual(omitted.tinode_uid, "usrOmitted123")
        self.assertFalse(already_inactive.active)
        self.assertEqual(already_inactive.properties["auth_version"], 7)
        self.assertEqual(
            already_inactive.properties["directory_removed_at"],
            1700000000,
        )
        self.assertEqual(already_inactive.tinode_uid, "usrInactive123")

    def test_rejected_viewer_is_deactivated_without_touching_tinode_history(self):
        viewer = SimpleNamespace(
            id="account-viewer",
            active=True,
            tinode_uid="usrViewer123",
            updated_at=10,
            properties={
                "auth_source": "account",
                "account_user_id": "account-user-viewer",
                "auth_version": 3,
            },
        )
        deactivate = isolated_function(CONTROLLER_PATH, "_deactivate_directory_viewer", {
            "time": SimpleNamespace(time=lambda: 1700000100),
        })

        self.assertTrue(deactivate(viewer))
        self.assertFalse(viewer.active)
        self.assertEqual(viewer.properties["auth_version"], 4)
        self.assertEqual(viewer.properties["directory_removed_at"], 1700000100)
        self.assertEqual(viewer.updated_at, 1700000100)
        self.assertEqual(viewer.tinode_uid, "usrViewer123")

        self.assertFalse(deactivate(viewer))
        self.assertEqual(viewer.properties["auth_version"], 4)


if __name__ == "__main__":
    unittest.main()
