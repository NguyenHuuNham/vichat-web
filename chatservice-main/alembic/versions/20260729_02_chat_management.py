"""Create chat management metadata tables.

Revision ID: 20260729_02
Revises: 20260729_01
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_02"
down_revision = "20260729_01"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("002_chat_management_and_history.sql")


def downgrade():
    irreversible_downgrade()
