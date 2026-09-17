"""Persist owner-scoped personal cloud file metadata.

Revision ID: 20260917_14
Revises: 20260825_13
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260917_14"
down_revision = "20260825_13"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("014_personal_cloud_files.sql")


def downgrade():
    irreversible_downgrade()
