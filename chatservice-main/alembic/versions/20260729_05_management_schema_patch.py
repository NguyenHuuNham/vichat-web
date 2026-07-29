"""Normalize legacy management schemas.

Revision ID: 20260729_05
Revises: 20260729_04
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_05"
down_revision = "20260729_04"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("005_secure_management_schema_patch.sql")


def downgrade():
    irreversible_downgrade()
