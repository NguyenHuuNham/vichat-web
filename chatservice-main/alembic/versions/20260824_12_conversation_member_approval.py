"""Persist pending group member approval state.

Revision ID: 20260824_12
Revises: 20260817_11
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260824_12"
down_revision = "20260817_11"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("012_conversation_member_approval.sql")


def downgrade():
    irreversible_downgrade()
