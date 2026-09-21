"""Add media cleanup registry state and direct-conversation hardening.

Revision ID: 20260921_15
Revises: 20260917_14
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260921_15"
down_revision = "20260917_14"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("015_audit_hardening.sql")


def downgrade():
    irreversible_downgrade()
