"""Store per-user conversation pin state.

Revision ID: 20260817_11
Revises: 20260804_10
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260817_11"
down_revision = "20260804_10"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("011_conversation_pins.sql")


def downgrade():
    irreversible_downgrade()
