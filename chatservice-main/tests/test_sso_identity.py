import importlib.util
import os
import unittest


PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULE_PATH = os.path.join(PROJECT_ROOT, "application", "services", "sso_identity.py")
SPEC = importlib.util.spec_from_file_location("sso_identity", MODULE_PATH)
SSO_IDENTITY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SSO_IDENTITY)

SSOIdentityError = SSO_IDENTITY.SSOIdentityError
account_session_matches = SSO_IDENTITY.account_session_matches
derive_tinode_password = SSO_IDENTITY.derive_tinode_password
direct_peer_tinode_uid = SSO_IDENTITY.direct_peer_tinode_uid
normalize_account_session = SSO_IDENTITY.normalize_account_session
normalize_account_directory_record = SSO_IDENTITY.normalize_account_directory_record
protected_tinode_account = SSO_IDENTITY.protected_tinode_account
stable_account_id = SSO_IDENTITY.stable_account_id
stable_local_account_id = SSO_IDENTITY.stable_local_account_id
stable_tinode_username = SSO_IDENTITY.stable_tinode_username
valid_tinode_username = SSO_IDENTITY.valid_tinode_username
valid_tinode_topic = SSO_IDENTITY.valid_tinode_topic


def account_payload(tenant_id, tenant_name, role="member", status="active"):
    return {
        "id": "user-shared-001",
        "user_name": "nham.nguyen",
        "full_name": "Nguyen Huu Nham",
        "email": "nham@example.vn",
        "current_tenant_id": tenant_id,
        "current_tenant_role": role,
        "tenants": [
            {
                "id": tenant_id,
                "tenant_name": tenant_name,
                "role": role,
                "status": status,
            },
        ],
        "password": "must-not-be-copied",
        "token": "must-not-be-copied",
    }


class SSOIdentityTests(unittest.TestCase):
    def test_directory_user_is_scoped_to_the_verified_tenant(self):
        identity = normalize_account_directory_record({
            "id": "account-user-2",
            "user_name": "lan.tran",
            "display_name": "Tran Thi Lan",
            "email": "lan@example.vn",
            "department": {"name": "Kinh doanh"},
            "role": "admin",
            "avatar_url": "https://account.upgo.vn/avatar/account-user-2.png",
        }, "tenant-a", "Tenant A")

        self.assertEqual(identity["tenant_id"], "tenant-a")
        self.assertEqual(identity["account_user_id"], "account-user-2")
        self.assertEqual(identity["department"], "Kinh doanh")
        self.assertEqual(identity["role"], "admin")
        self.assertTrue(identity["active"])
        self.assertNotIn("password", identity)
        self.assertNotIn("token", identity)

    def test_directory_user_preserves_inactive_status(self):
        identity = normalize_account_directory_record({
            "id": "account-user-disabled",
            "user_name": "disabled.user",
            "status": "disabled",
        }, "tenant-a", "Tenant A")

        self.assertFalse(identity["active"])

    def test_pending_invitation_is_not_projected_as_an_active_chat_user(self):
        identity = normalize_account_directory_record({
            "id": "account-user-pending",
            "user_name": "pending.user",
            "status": "pending",
        }, "tenant-a", "Tenant A")

        self.assertFalse(identity["active"])

    def test_two_tenants_get_distinct_chat_and_tinode_identities(self):
        tenant_a = normalize_account_session(account_payload("tenant-a", "Tenant A", role="admin"))
        tenant_b = normalize_account_session(account_payload("tenant-b", "Tenant B"))

        self.assertNotEqual(
            stable_account_id(tenant_a["tenant_id"], tenant_a["account_user_id"]),
            stable_account_id(tenant_b["tenant_id"], tenant_b["account_user_id"]),
        )
        tinode_a = stable_tinode_username(tenant_a["tenant_id"], tenant_a["account_user_id"])
        tinode_b = stable_tinode_username(tenant_b["tenant_id"], tenant_b["account_user_id"])
        self.assertNotEqual(tinode_a, tinode_b)
        self.assertTrue(valid_tinode_username(tinode_a))
        self.assertTrue(valid_tinode_username(tinode_b))
        self.assertLessEqual(len(tinode_a), 26)
        self.assertLessEqual(len("basic:" + tinode_a), 32)
        self.assertEqual(tenant_a["role"], "admin")
        self.assertEqual(tenant_b["role"], "member")

    def test_tinode_credentials_are_deterministic_and_tenant_scoped(self):
        secret = "s" * 48
        identity_a = normalize_account_session(account_payload("tenant-a", "Tenant A"))
        identity_b = normalize_account_session(account_payload("tenant-b", "Tenant B"))
        username_a = stable_tinode_username("tenant-a", identity_a["account_user_id"])
        username_b = stable_tinode_username("tenant-b", identity_b["account_user_id"])

        password_a = derive_tinode_password(secret, "tenant-a", identity_a["account_user_id"], username_a)
        self.assertEqual(
            password_a,
            derive_tinode_password(secret, "tenant-a", identity_a["account_user_id"], username_a),
        )
        self.assertNotEqual(
            password_a,
            derive_tinode_password(secret, "tenant-b", identity_b["account_user_id"], username_b),
        )
        self.assertNotIn(identity_a["username"], password_a)

    def test_same_local_username_is_isolated_between_tenants(self):
        account_a = stable_local_account_id("tenant-a", "nhanvien")
        account_b = stable_local_account_id("tenant-b", "nhanvien")
        tinode_a = stable_tinode_username("tenant-a", account_a)
        tinode_b = stable_tinode_username("tenant-b", account_b)

        self.assertNotEqual(account_a, account_b)
        self.assertNotEqual(tinode_a, tinode_b)
        self.assertNotEqual(
            derive_tinode_password("s" * 48, "tenant-a", account_a, tinode_a),
            derive_tinode_password("s" * 48, "tenant-b", account_b, tinode_b),
        )

    def test_account_mapping_rejects_cross_tenant_session(self):
        identity_a = normalize_account_session(account_payload("tenant-a", "Tenant A"))
        identity_b = normalize_account_session(account_payload("tenant-b", "Tenant B"))
        properties_a = {
            "auth_source": "account",
            "account_user_id": identity_a["account_user_id"],
            "account_tenant_id": identity_a["tenant_id"],
        }

        self.assertTrue(account_session_matches(properties_a, identity_a))
        self.assertFalse(account_session_matches(properties_a, identity_b))

    def test_unknown_current_tenant_falls_back_to_first_active_membership(self):
        payload = account_payload("tenant-a", "Tenant A", role="admin")
        payload["tenants"] = account_payload("tenant-b", "Tenant B", role="member")["tenants"]

        identity = normalize_account_session(payload)

        self.assertEqual(identity["tenant_id"], "tenant-b")
        self.assertEqual(identity["tenant_name"], "Tenant B")
        self.assertEqual(identity["role"], "member")
        self.assertEqual(identity["account_role"], "member")

    def test_inactive_current_tenant_falls_back_to_first_active_membership(self):
        payload = account_payload("tenant-a", "Tenant A", role="admin", status="pending")
        payload["tenants"].append({
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "member",
            "status": "active",
        })

        identity = normalize_account_session(payload)

        self.assertEqual(identity["tenant_id"], "tenant-b")
        self.assertEqual(identity["role"], "member")
        self.assertEqual(identity["account_role"], "member")

    def test_active_current_tenant_remains_authoritative(self):
        payload = account_payload("tenant-a", "Tenant A", role="admin")
        payload["tenants"].insert(0, {
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "member",
            "status": "active",
        })

        identity = normalize_account_session(payload)

        self.assertEqual(identity["tenant_id"], "tenant-a")
        self.assertEqual(identity["tenant_name"], "Tenant A")
        self.assertEqual(identity["role"], "admin")

    def test_preferred_tenant_selects_another_active_membership(self):
        payload = account_payload("tenant-a", "Tenant A", role="admin")
        payload["tenants"].append({
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "member",
            "status": "active",
            "logo_updated_at": "2026-08-18T21:30:00Z",
            "company": {
                "logo_url": "https://account.upgo.vn/company-b.svg",
            },
        })

        identity = normalize_account_session(payload, preferred_tenant_id="tenant-b")

        self.assertEqual(identity["tenant_id"], "tenant-b")
        self.assertEqual(identity["tenant_name"], "Tenant B")
        self.assertEqual(identity["role"], "member")
        self.assertEqual(
            next(option["logo"] for option in identity["tenant_options"] if option["id"] == "tenant-b"),
            "https://account.upgo.vn/company-b.svg",
        )
        self.assertEqual(
            next(option["logo_version"] for option in identity["tenant_options"] if option["id"] == "tenant-b"),
            "2026-08-18T21:30:00Z",
        )
        self.assertEqual(
            {option["id"] for option in identity["tenant_options"]},
            {"tenant-a", "tenant-b"},
        )
        self.assertNotIn("password", identity)
        self.assertNotIn("token", identity)

    def test_preferred_tenant_rejects_unknown_or_inactive_membership(self):
        payload = account_payload("tenant-a", "Tenant A")
        payload["tenants"].append({
            "id": "tenant-disabled",
            "tenant_name": "Disabled tenant",
            "role": "member",
            "status": "disabled",
        })

        with self.assertRaisesRegex(SSOIdentityError, "Requested Account tenant membership is not active"):
            normalize_account_session(payload, preferred_tenant_id="tenant-disabled")
        with self.assertRaisesRegex(SSOIdentityError, "Requested Account tenant membership is not active"):
            normalize_account_session(payload, preferred_tenant_id="tenant-unknown")

    def test_directory_record_with_foreign_tenant_is_rejected(self):
        with self.assertRaisesRegex(SSOIdentityError, "outside the verified tenant"):
            normalize_account_directory_record({
                "id": "account-user-2",
                "user_name": "other.user",
                "tenant_id": "tenant-b",
            }, "tenant-a", "Tenant A")

    def test_explicit_tenant_without_active_memberships_is_rejected(self):
        with self.assertRaisesRegex(SSOIdentityError, "no active tenant membership"):
            normalize_account_session(account_payload("tenant-a", "Tenant A", status="disabled"))

    def test_single_active_membership_is_used_when_current_tenant_is_missing(self):
        payload = account_payload("tenant-a", "Tenant A", role="admin")
        payload["current_tenant_id"] = None
        payload["current_tenant_role"] = None

        identity = normalize_account_session(payload)

        self.assertEqual(identity["tenant_id"], "tenant-a")
        self.assertEqual(identity["tenant_name"], "Tenant A")
        self.assertEqual(identity["role"], "admin")

    def test_fallback_tenant_uses_membership_role_instead_of_stale_current_role(self):
        payload = account_payload("tenant-a", "Tenant A", role="member")
        payload["current_tenant_id"] = None
        payload["current_tenant_role"] = "admin"

        identity = normalize_account_session(payload)

        self.assertEqual(identity["role"], "member")
        self.assertEqual(identity["account_role"], "member")

    def test_only_active_membership_is_used_when_other_memberships_are_disabled(self):
        payload = account_payload("tenant-a", "Tenant A")
        payload["current_tenant_id"] = None
        payload["tenants"].append({
            "id": "tenant-disabled",
            "tenant_name": "Disabled tenant",
            "role": "admin",
            "status": "disabled",
        })

        identity = normalize_account_session(payload)

        self.assertEqual(identity["tenant_id"], "tenant-a")

    def test_missing_current_tenant_uses_the_first_active_membership(self):
        ambiguous = account_payload("tenant-a", "Tenant A")
        ambiguous["current_tenant_id"] = None
        ambiguous["tenants"].append({
            "id": "tenant-b",
            "tenant_name": "Tenant B",
            "role": "member",
            "status": "active",
        })
        identity = normalize_account_session(ambiguous)
        self.assertEqual(identity["tenant_id"], "tenant-a")
        self.assertEqual(identity["tenant_name"], "Tenant A")

        empty = account_payload("tenant-a", "Tenant A")
        empty["current_tenant_id"] = None
        empty["tenants"] = []
        with self.assertRaisesRegex(SSOIdentityError, "no active tenant membership"):
            normalize_account_session(empty)

    def test_account_brand_membership_shape_is_normalized_for_manual_login(self):
        identity = normalize_account_session({
            "id": "account-user-brand",
            "username": "brand.user",
            "email": "brand@example.vn",
            "brands": [{
                "brand_id": "brand-vn-test",
                "brand_name": "VN TEST",
                "brand_role": "member",
                "is_active": True,
            }],
        })

        self.assertEqual(identity["tenant_id"], "brand-vn-test")
        self.assertEqual(identity["tenant_name"], "VN TEST")
        self.assertEqual(identity["role"], "member")

    def test_single_current_tenant_field_is_used_without_a_membership_array(self):
        identity = normalize_account_session({
            "id": "account-user-company",
            "user_name": "company.user",
            "company_id": "company-vn-test",
            "company_name": "VN TEST",
            "current_company_role": "admin",
        })

        self.assertEqual(identity["tenant_id"], "company-vn-test")
        self.assertEqual(identity["tenant_name"], "VN TEST")
        self.assertEqual(identity["role"], "admin")

    def test_normalized_identity_does_not_copy_password_or_token(self):
        identity = normalize_account_session(account_payload("tenant-a", "Tenant A"))
        self.assertNotIn("password", identity)
        self.assertNotIn("token", identity)

    def test_avatar_url_is_used_as_the_account_profile_image(self):
        payload = account_payload("tenant-a", "Tenant A")
        payload["avatar_url"] = "https://account.upgo.vn/avatar/user-shared-001.png"

        identity = normalize_account_session(payload)

        self.assertEqual(identity["avatar"], payload["avatar_url"])

    def test_tinode_root_account_is_never_reused_for_sso(self):
        self.assertTrue(protected_tinode_account({"bootstrap": True}, "admin", "root"))
        self.assertTrue(protected_tinode_account({}, "admin", "ADMIN"))
        self.assertFalse(protected_tinode_account({}, "employee", "admin"))

    def test_tinode_topics_are_type_checked(self):
        self.assertTrue(valid_tinode_topic("grpAbcdef123456", is_group=True))
        self.assertTrue(valid_tinode_topic("usrAbcdef123456", is_group=False))
        self.assertFalse(valid_tinode_topic("usrAbcdef123456", is_group=True))
        self.assertFalse(valid_tinode_topic("grpAbcdef123456", is_group=False))
        self.assertFalse(valid_tinode_topic("newAbcdef123456", is_group=True))

    def test_direct_topic_is_the_other_participant_for_each_viewer(self):
        participants = ["account-a", "account-b"]
        tinode_uids = {"account-a": "usrAccountA", "account-b": "usrAccountB"}

        self.assertEqual(
            direct_peer_tinode_uid("account-a", participants, tinode_uids),
            "usrAccountB",
        )
        self.assertEqual(
            direct_peer_tinode_uid("account-b", participants, tinode_uids),
            "usrAccountA",
        )

    def test_direct_topic_requires_two_participants_and_a_prepared_peer(self):
        self.assertEqual(direct_peer_tinode_uid("account-a", ["account-a"], {}), "")
        self.assertEqual(
            direct_peer_tinode_uid(
                "account-a",
                ["account-a", "account-b"],
                {"account-a": "usrAccountA"},
            ),
            "",
        )


if __name__ == "__main__":
    unittest.main()
