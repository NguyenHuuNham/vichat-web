from pathlib import Path

from alembic import context, op


MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"


def run_sql_migration(filename):
    sql_path = MIGRATIONS_DIR / filename
    sql = sql_path.read_text(encoding="utf-8")
    statements = [
        line for line in sql.splitlines()
        if line.strip().upper() not in ("BEGIN;", "COMMIT;")
    ]
    migration_sql = "\n".join(statements)
    if context.is_offline_mode():
        op.execute(migration_sql)
        return

    cursor = op.get_bind().connection.cursor()
    try:
        cursor.execute(migration_sql)
    finally:
        cursor.close()


def irreversible_downgrade():
    raise RuntimeError(
        "This data-preserving migration has no automatic downgrade. "
        "Restore the pre-migration PostgreSQL backup instead."
    )
