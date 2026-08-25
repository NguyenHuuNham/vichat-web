"""Persist viewer-scoped direct message blocking.

Revision ID: 20260825_13
Revises: 20260824_12
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260825_13"
down_revision = "20260824_12"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("013_direct_message_blocking.sql")


def downgrade():
    irreversible_downgrade()
