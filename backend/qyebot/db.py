import sqlite3
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from qyebot.config import DB_PATH

TZ = ZoneInfo("Asia/Shanghai")

SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personnel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userid TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS directory_users (
    userid TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    personnel_id INTEGER,
    clock_in TEXT NOT NULL,
    clock_out TEXT NOT NULL,
    weekdays TEXT NOT NULL DEFAULT '1,2,3,4,5',
    timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    skip_holidays INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (personnel_id) REFERENCES personnel(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminder_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    schedule_id INTEGER,
    target_mode TEXT NOT NULL DEFAULT 'all',
    target_ids TEXT NOT NULL DEFAULT '',
    offset_minutes INTEGER NOT NULL DEFAULT -15,
    repeat_every_minutes INTEGER NOT NULL DEFAULT 0,
    repeat_max INTEGER NOT NULL DEFAULT 1,
    grace_minutes INTEGER NOT NULL DEFAULT 20,
    require_not_checked INTEGER NOT NULL DEFAULT 1,
    template TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_workday INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personnel_id INTEGER,
    userid TEXT NOT NULL,
    person_name TEXT NOT NULL DEFAULT '',
    rule_id INTEGER,
    rule_name TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    slot_at TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    msgid TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_logs_slot
    ON reminder_logs(userid, rule_id, slot_at);
CREATE INDEX IF NOT EXISTS idx_logs_sent ON reminder_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_logs_day ON reminder_logs(slot_at);

CREATE TABLE IF NOT EXISTS leave_approvals (
    sp_no TEXT PRIMARY KEY,
    userid TEXT NOT NULL,
    sp_status INTEGER NOT NULL,
    leave_start TEXT NOT NULL,
    leave_end TEXT NOT NULL,
    leave_name TEXT NOT NULL DEFAULT '',
    apply_time TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leave_user_time
    ON leave_approvals(userid, leave_start, leave_end);
"""


def now_iso():
    return datetime.now(TZ).isoformat(timespec="seconds")


def parse_ids(text):
    out = []
    for part in (text or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


def _flag(row, *keys):
    if row is None:
        return None
    data = dict(row)
    for key in keys:
        if data.get(key) is not None:
            data[key] = bool(data[key])
    return data


def rule_out(row):
    data = _flag(row, "enabled", "require_not_checked")
    if data is None:
        return None
    data["target_ids"] = parse_ids(data.get("target_ids"))
    return data


def schedule_out(row):
    return _flag(row, "enabled", "skip_holidays", "is_default")


def person_out(row):
    return _flag(row, "enabled")


@contextmanager
def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with connect() as conn:
        conn.executescript(SCHEMA)
        _seed(conn)


def _seed(conn):
    now = now_iso()
    conn.execute(
        "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES ('scheduler_enabled', '1', ?)",
        (now,),
    )
    seeded = conn.execute("SELECT value FROM settings WHERE key='seeded'").fetchone()
    if seeded:
        return
    conn.execute(
        """
        INSERT INTO schedules (
            name, personnel_id, clock_in, clock_out, weekdays, timezone,
            skip_holidays, is_default, enabled, created_at, updated_at
        ) VALUES ('默认班次', NULL, '09:00', '18:30', '1,2,3,4,5', 'Asia/Shanghai', 1, 1, 1, ?, ?)
        """,
        (now, now),
    )
    rules = [
        ("上班前提醒", "clock_in", -15, 0, 1, 1, "{name}，{clock_time} 就要上班了。先打个卡，待会忙起来也不用记着。"),
        ("下班前提醒", "clock_out", -10, 0, 1, 1, "{name}，{clock_time} 下班。走之前打个卡，今天这件小事就办完了。"),
        ("上班后再提醒一次", "clock_in", 5, 15, 3, 1, "{name}，{clock_time} 的上班卡如果还没打，现在补一下就好。"),
    ]
    for name, kind, offset, every, repeat_max, require, template in rules:
        conn.execute(
            """
            INSERT INTO reminder_rules (
                name, kind, schedule_id, target_mode, target_ids, offset_minutes,
                repeat_every_minutes, repeat_max, grace_minutes, require_not_checked,
                template, enabled, created_at, updated_at
            ) VALUES (?, ?, NULL, 'all', '', ?, ?, ?, 20, ?, ?, 1, ?, ?)
            """,
            (name, kind, offset, every, repeat_max, require, template, now, now),
        )
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES ('seeded', '1', ?)",
        (now,),
    )


def get_settings():
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
    return {row["key"]: row["value"] for row in rows}


def set_settings(pairs):
    now = now_iso()
    with connect() as conn:
        for key, value in pairs.items():
            conn.execute(
                """
                INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
                """,
                (key, "" if value is None else str(value), now),
            )


def list_personnel():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM personnel ORDER BY enabled DESC, name COLLATE NOCASE, id"
        ).fetchall()
    return [person_out(row) for row in rows]


def get_person(person_id):
    with connect() as conn:
        row = conn.execute("SELECT * FROM personnel WHERE id=?", (person_id,)).fetchone()
    return person_out(row)


def create_person(data):
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO personnel (userid, name, department, mobile, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["userid"],
                data["name"],
                data.get("department") or "",
                data.get("mobile") or "",
                1 if data.get("enabled", True) else 0,
                now,
                now,
            ),
        )
        person_id = cur.lastrowid
    return get_person(person_id)


def update_person(person_id, data):
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE personnel
            SET userid=?, name=?, department=?, mobile=?, enabled=?, updated_at=?
            WHERE id=?
            """,
            (
                data["userid"],
                data["name"],
                data.get("department") or "",
                data.get("mobile") or "",
                1 if data.get("enabled", True) else 0,
                now,
                person_id,
            ),
        )
        if cur.rowcount == 0:
            return None
    return get_person(person_id)


def set_enabled(table, row_id, enabled):
    if table not in {"personnel", "schedules", "reminder_rules"}:
        raise ValueError(table)
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            f"UPDATE {table} SET enabled=?, updated_at=? WHERE id=?",
            (1 if enabled else 0, now, row_id),
        )
        return cur.rowcount > 0


def delete_person(person_id):
    with connect() as conn:
        conn.execute("DELETE FROM schedules WHERE personnel_id=?", (person_id,))
        cur = conn.execute("DELETE FROM personnel WHERE id=?", (person_id,))
        return cur.rowcount > 0


def list_directory():
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM directory_users ORDER BY department COLLATE NOCASE, name COLLATE NOCASE, userid"
        ).fetchall()
    return [dict(row) for row in rows]


def save_directory(rows, replace):
    now = now_iso()
    kept = []
    with connect() as conn:
        for row in rows:
            userid = (row.get("userid") or "").strip()
            name = (row.get("name") or "").strip() or userid
            if not userid:
                continue
            kept.append(userid)
            conn.execute(
                """
                INSERT INTO directory_users (userid, name, department, mobile, updated_at)
                VALUES (?, ?, ?, '', ?)
                ON CONFLICT(userid) DO UPDATE SET
                    name=excluded.name,
                    department=excluded.department,
                    updated_at=excluded.updated_at
                """,
                (userid, name, row.get("department") or "", now),
            )
        if replace:
            if kept:
                marks = ",".join("?" * len(kept))
                conn.execute(f"DELETE FROM directory_users WHERE userid NOT IN ({marks})", kept)
            else:
                conn.execute("DELETE FROM directory_users")
        if kept:
            conn.execute(
                """
                UPDATE personnel
                SET name = (
                        SELECT name FROM directory_users
                        WHERE directory_users.userid = personnel.userid
                    ),
                    department = (
                        SELECT department FROM directory_users
                        WHERE directory_users.userid = personnel.userid
                    ),
                    updated_at = ?
                WHERE userid IN (SELECT userid FROM directory_users)
                """,
                (now,),
            )
    return {"cached": len(kept)}


def add_from_directory(userids):
    now = now_iso()
    added = 0
    with connect() as conn:
        for userid in dict.fromkeys(userids):
            userid = (userid or "").strip()
            row = conn.execute(
                "SELECT * FROM directory_users WHERE userid=?",
                (userid,),
            ).fetchone()
            if not row:
                continue
            existing = conn.execute(
                "SELECT id FROM personnel WHERE userid=?",
                (userid,),
            ).fetchone()
            if existing:
                continue
            conn.execute(
                """
                INSERT INTO personnel (userid, name, department, mobile, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (row["userid"], row["name"], row["department"], row["mobile"] or "", now, now),
            )
            added += 1
    return {"added": added}


def upsert_people(rows):
    now = now_iso()
    created = 0
    updated = 0
    with connect() as conn:
        for row in rows:
            userid = (row.get("userid") or "").strip()
            name = (row.get("name") or "").strip() or userid
            if not userid:
                continue
            existing = conn.execute("SELECT id FROM personnel WHERE userid=?", (userid,)).fetchone()
            if existing:
                conn.execute(
                    "UPDATE personnel SET name=?, department=?, updated_at=? WHERE userid=?",
                    (name, row.get("department") or "", now, userid),
                )
                updated += 1
            else:
                conn.execute(
                    """
                    INSERT INTO personnel (userid, name, department, mobile, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, '', 1, ?, ?)
                    """,
                    (userid, name, row.get("department") or "", now, now),
                )
                created += 1
    return {"created": created, "updated": updated, "total": created + updated}


def list_schedules():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT s.*, p.name AS person_name, p.userid AS person_userid
            FROM schedules s
            LEFT JOIN personnel p ON p.id = s.personnel_id
            ORDER BY s.is_default DESC, s.personnel_id IS NOT NULL, s.id
            """
        ).fetchall()
    return [schedule_out(row) for row in rows]


def get_schedule(schedule_id):
    with connect() as conn:
        row = conn.execute(
            """
            SELECT s.*, p.name AS person_name, p.userid AS person_userid
            FROM schedules s
            LEFT JOIN personnel p ON p.id = s.personnel_id
            WHERE s.id=?
            """,
            (schedule_id,),
        ).fetchone()
    return schedule_out(row)


def _write_schedule(conn, data, schedule_id=None):
    now = now_iso()
    payload = (
        data["name"],
        data.get("personnel_id"),
        data["clock_in"],
        data["clock_out"],
        data["weekdays"],
        data.get("timezone") or "Asia/Shanghai",
        1 if data.get("skip_holidays", True) else 0,
        1 if data.get("is_default") else 0,
        1 if data.get("enabled", True) else 0,
        now,
    )
    if schedule_id is None:
        cur = conn.execute(
            """
            INSERT INTO schedules (
                name, personnel_id, clock_in, clock_out, weekdays, timezone,
                skip_holidays, is_default, enabled, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*payload, now),
        )
        schedule_id = cur.lastrowid
    else:
        conn.execute(
            """
            UPDATE schedules
            SET name=?, personnel_id=?, clock_in=?, clock_out=?, weekdays=?, timezone=?,
                skip_holidays=?, is_default=?, enabled=?, updated_at=?
            WHERE id=?
            """,
            (*payload, schedule_id),
        )
    if data.get("is_default") and not data.get("personnel_id"):
        conn.execute("UPDATE schedules SET is_default=0 WHERE id!=?", (schedule_id,))
    return schedule_id


def create_schedule(data):
    with connect() as conn:
        schedule_id = _write_schedule(conn, data)
    return get_schedule(schedule_id)


def update_schedule(schedule_id, data):
    with connect() as conn:
        existing = conn.execute("SELECT id FROM schedules WHERE id=?", (schedule_id,)).fetchone()
        if not existing:
            return None
        _write_schedule(conn, data, schedule_id)
    return get_schedule(schedule_id)


def count_rules_for_schedule(schedule_id):
    with connect() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM reminder_rules WHERE schedule_id=?",
            (schedule_id,),
        ).fetchone()
    return row["c"]


def delete_schedule(schedule_id):
    with connect() as conn:
        cur = conn.execute("DELETE FROM schedules WHERE id=?", (schedule_id,))
        return cur.rowcount > 0


def list_rules():
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT r.*, s.name AS schedule_name
            FROM reminder_rules r
            LEFT JOIN schedules s ON s.id = r.schedule_id
            ORDER BY r.enabled DESC, r.id
            """
        ).fetchall()
    return [rule_out(row) for row in rows]


def get_rule(rule_id):
    with connect() as conn:
        row = conn.execute(
            """
            SELECT r.*, s.name AS schedule_name
            FROM reminder_rules r
            LEFT JOIN schedules s ON s.id = r.schedule_id
            WHERE r.id=?
            """,
            (rule_id,),
        ).fetchone()
    return rule_out(row)


def _rule_tuple(data, now):
    ids = ",".join(str(item) for item in data.get("target_ids") or [])
    return (
        data["name"],
        data["kind"],
        data.get("schedule_id"),
        data.get("target_mode") or "all",
        ids,
        int(data["offset_minutes"]),
        int(data["repeat_every_minutes"]),
        int(data["repeat_max"]),
        int(data["grace_minutes"]),
        1 if data.get("require_not_checked", True) else 0,
        data["template"],
        1 if data.get("enabled", True) else 0,
        now,
    )


def create_rule(data):
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            """
            INSERT INTO reminder_rules (
                name, kind, schedule_id, target_mode, target_ids, offset_minutes,
                repeat_every_minutes, repeat_max, grace_minutes, require_not_checked,
                template, enabled, updated_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*_rule_tuple(data, now), now),
        )
        rule_id = cur.lastrowid
    return get_rule(rule_id)


def update_rule(rule_id, data):
    now = now_iso()
    with connect() as conn:
        cur = conn.execute(
            """
            UPDATE reminder_rules
            SET name=?, kind=?, schedule_id=?, target_mode=?, target_ids=?, offset_minutes=?,
                repeat_every_minutes=?, repeat_max=?, grace_minutes=?, require_not_checked=?,
                template=?, enabled=?, updated_at=?
            WHERE id=?
            """,
            (*_rule_tuple(data, now), rule_id),
        )
        if cur.rowcount == 0:
            return None
    return get_rule(rule_id)


def delete_rule(rule_id):
    with connect() as conn:
        cur = conn.execute("DELETE FROM reminder_rules WHERE id=?", (rule_id,))
        return cur.rowcount > 0


def list_holidays():
    with connect() as conn:
        rows = conn.execute("SELECT * FROM holidays ORDER BY day").fetchall()
    return [_flag(row, "is_workday") for row in rows]


def upsert_holiday(data):
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO holidays (day, name, is_workday) VALUES (?, ?, ?)
            ON CONFLICT(day) DO UPDATE SET name=excluded.name, is_workday=excluded.is_workday
            """,
            (data["day"], data["name"], 1 if data.get("is_workday") else 0),
        )
        row = conn.execute("SELECT * FROM holidays WHERE day=?", (data["day"],)).fetchone()
    return _flag(row, "is_workday")


def delete_holiday(holiday_id):
    with connect() as conn:
        cur = conn.execute("DELETE FROM holidays WHERE id=?", (holiday_id,))
        return cur.rowcount > 0


def upsert_leave(row):
    now = now_iso()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO leave_approvals (
                sp_no, userid, sp_status, leave_start, leave_end, leave_name, apply_time, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sp_no) DO UPDATE SET
                userid=excluded.userid,
                sp_status=excluded.sp_status,
                leave_start=excluded.leave_start,
                leave_end=excluded.leave_end,
                leave_name=excluded.leave_name,
                apply_time=excluded.apply_time,
                updated_at=excluded.updated_at
            """,
            (
                row["sp_no"],
                row["userid"],
                int(row["sp_status"]),
                row["leave_start"],
                row["leave_end"],
                row.get("leave_name") or "",
                row["apply_time"],
                now,
            ),
        )


def delete_leave(sp_no):
    with connect() as conn:
        conn.execute("DELETE FROM leave_approvals WHERE sp_no=?", (sp_no,))


def prune_leaves(before_iso):
    with connect() as conn:
        cur = conn.execute("DELETE FROM leave_approvals WHERE leave_end < ?", (before_iso,))
        return cur.rowcount


def list_leaves_to_refresh(since_iso):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT sp_no FROM leave_approvals
            WHERE sp_status IN (1, 2) AND leave_end >= ?
            """,
            (since_iso,),
        ).fetchall()
    return [row["sp_no"] for row in rows]


def on_leave(userid, moment_iso):
    try:
        moment = datetime.fromisoformat(moment_iso)
    except ValueError:
        return False
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT leave_start, leave_end FROM leave_approvals
            WHERE userid=? AND sp_status=2
            """,
            (userid,),
        ).fetchall()
    for row in rows:
        try:
            start = datetime.fromisoformat(row["leave_start"])
            end = datetime.fromisoformat(row["leave_end"])
        except ValueError:
            continue
        if start <= moment <= end:
            return True
    return False


def list_logs(page=1, page_size=20, status=None):
    page = max(int(page), 1)
    page_size = min(max(int(page_size), 1), 100)
    where = ""
    args = []
    if status:
        where = " WHERE status=?"
        args.append(status)
    with connect() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS n FROM reminder_logs{where}", args).fetchone()["n"]
        pages = max((total + page_size - 1) // page_size, 1) if total else 1
        if page > pages:
            page = pages
        offset = (page - 1) * page_size
        rows = conn.execute(
            f"SELECT * FROM reminder_logs{where} ORDER BY id DESC LIMIT ? OFFSET ?",
            [*args, page_size, offset],
        ).fetchall()
    return {
        "items": [dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": pages,
    }


def logs_on(day):
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM reminder_logs WHERE substr(slot_at, 1, 10)=?",
            (day,),
        ).fetchall()
    return [dict(row) for row in rows]


def save_log(
    *,
    personnel_id,
    userid,
    person_name,
    rule_id,
    rule_name,
    kind,
    slot_at,
    status,
    detail="",
    msgid="",
):
    now = now_iso()
    with connect() as conn:
        if rule_id is None:
            existing = conn.execute(
                """
                SELECT id, status FROM reminder_logs
                WHERE userid=? AND rule_id IS NULL AND slot_at=?
                """,
                (userid, slot_at),
            ).fetchone()
        else:
            existing = conn.execute(
                """
                SELECT id, status FROM reminder_logs
                WHERE userid=? AND rule_id=? AND slot_at=?
                """,
                (userid, rule_id, slot_at),
            ).fetchone()
        if existing and existing["status"] != "failed":
            return "exists"
        if existing:
            conn.execute(
                """
                UPDATE reminder_logs
                SET status=?, detail=?, msgid=?, sent_at=?, person_name=?, rule_name=?, kind=?
                WHERE id=?
                """,
                (status, detail, msgid, now, person_name, rule_name, kind, existing["id"]),
            )
            return "updated"
        try:
            conn.execute(
                """
                INSERT INTO reminder_logs (
                    personnel_id, userid, person_name, rule_id, rule_name, kind,
                    slot_at, sent_at, status, detail, msgid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    personnel_id,
                    userid,
                    person_name,
                    rule_id,
                    rule_name,
                    kind,
                    slot_at,
                    now,
                    status,
                    detail,
                    msgid,
                ),
            )
        except sqlite3.IntegrityError:
            return "exists"
    return "inserted"
