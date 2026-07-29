"""Create management authentication tables.

Revision ID: 20260729_04
Revises: 20260729_03
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_04"
down_revision = "20260729_03"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("004_secure_management_auth.sql")


def downgrade():
    irreversible_downgrade()
