"""Store per-user conversation notification mute deadlines.

Revision ID: 20260803_09
Revises: 20260729_08
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260803_09"
down_revision = "20260729_08"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("009_conversation_notification_preferences.sql")


def downgrade():
    irreversible_downgrade()
