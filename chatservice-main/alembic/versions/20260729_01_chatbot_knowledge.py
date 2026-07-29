"""Create chatbot knowledge tables.

Revision ID: 20260729_01
Revises:
"""

from migration_utils import irreversible_downgrade, run_sql_migration


revision = "20260729_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    run_sql_migration("001_chatbot_knowledge.sql")


def downgrade():
    irreversible_downgrade()
