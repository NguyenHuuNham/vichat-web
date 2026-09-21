"""Add private personal cloud text messages.

Revision ID: 20260921_16
Revises: 20260921_15
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260921_16"
down_revision = "20260921_15"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("016_personal_cloud_messages.sql")


def downgrade():
    irreversible_downgrade()
