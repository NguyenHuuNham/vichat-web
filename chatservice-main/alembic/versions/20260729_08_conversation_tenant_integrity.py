"""Make conversation participants authoritative and tenant-safe.

Revision ID: 20260729_08
Revises: 20260729_07
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_08"
down_revision = "20260729_07"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("008_conversation_tenant_integrity.sql")


def downgrade():
    irreversible_downgrade()
