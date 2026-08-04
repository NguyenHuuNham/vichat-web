"""Add tenant-scoped enterprise workspace metadata.

Revision ID: 20260804_10
Revises: 20260803_09
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260804_10"
down_revision = "20260803_09"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("010_enterprise_workspace.sql")


def downgrade():
    irreversible_downgrade()
