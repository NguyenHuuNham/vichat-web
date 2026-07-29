"""Create friend request tables.

Revision ID: 20260729_03
Revises: 20260729_02
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_03"
down_revision = "20260729_02"
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("003_friend_requests.sql")


def downgrade():
    irreversible_downgrade()
