"""Create password reset token storage.

Revision ID: 20260729_06
Revises: 20260729_05
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_06"
down_revision = "20260729_05"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("006_password_reset_tokens.sql")


def downgrade():
    irreversible_downgrade()
