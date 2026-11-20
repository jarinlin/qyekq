"""已有数据库在启动时按版本补齐。换上新文件并重启即可，不用手工改表。"""

from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")


def _columns(conn, table):
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def _add_absence_kind(conn):
    if "kind" in _columns(conn, "leave_approvals"):
        return
    conn.execute("ALTER TABLE leave_approvals ADD COLUMN kind TEXT NOT NULL DEFAULT 'leave'")


MIGRATIONS = [
    (1, "leave_approvals.kind", _add_absence_kind),
]


def apply(conn):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )
    applied = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations")}
    now = datetime.now(TZ).isoformat(timespec="seconds")
    for version, name, step in MIGRATIONS:
        if version in applied:
            continue
        step(conn)
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            (version, name, now),
        )
