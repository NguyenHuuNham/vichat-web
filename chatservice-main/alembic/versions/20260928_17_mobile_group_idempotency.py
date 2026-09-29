"""Add tenant-scoped idempotency for mobile group creation.

Revision ID: 20260928_17
Revises: 20260921_16
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260928_17"
down_revision = "20260921_16"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("017_mobile_group_idempotency.sql")


def downgrade():
    irreversible_downgrade()
