"""Normalize existing management display values.

Revision ID: 20260729_07
Revises: 20260729_06
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_07"
down_revision = "20260729_06"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("007_normalize_management_identity.sql")


def downgrade():
    irreversible_downgrade()
