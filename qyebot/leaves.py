import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from qyebot import db, wecom

log = logging.getLogger("qyebot")

TZ = ZoneInfo("Asia/Shanghai")
KEEP_DAYS = 28
DEFAULT_CLOCK = (6, 30)
OVERLAP_SECONDS = 120
CHUNK_SECONDS = 28 * 24 * 3600
FAIL_WAIT = 30 * 60
DROPPED = {3, 4, 6, 7}


def sync_clock(raw):
    text = (raw or "").strip()
    parts = text.split(":")
    if len(parts) < 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return DEFAULT_CLOCK
    hour, minute = int(parts[0]), int(parts[1])
    if hour > 23 or minute > 59:
        return DEFAULT_CLOCK
    return hour, minute


def format_sync_clock(raw):
    hour, minute = sync_clock(raw)
    return f"{hour:02d}:{minute:02d}"


def sync_if_due():
    settings = db.get_settings()
    if not (settings.get("corp_id") and settings.get("agent_id") and settings.get("secret")):
        return {"ran": False, "reason": "企业微信还没配置"}
    now = datetime.now(TZ)
    failed_raw = (settings.get("leave_sync_fail_at") or "").strip()
    if failed_raw.isdigit() and int(now.timestamp()) < int(failed_raw):
        return {"ran": False, "reason": "上次拉取失败，稍后再试"}
    hour, minute = sync_clock(settings.get("leave_sync_time"))
    due = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    clock = f"{hour:02d}:{minute:02d}"
    if now < due:
        return {"ran": False, "reason": f"还没到今天 {clock}"}
    last_raw = (settings.get("leave_sync_at") or "").strip()
    if last_raw.isdigit():
        last_dt = datetime.fromtimestamp(int(last_raw), TZ)
        if last_dt >= due:
            return {"ran": False, "reason": f"今天 {clock} 已经拉取过"}
        start = max(int(last_raw) - OVERLAP_SECONDS, int(now.timestamp()) - KEEP_DAYS * 86400)
    else:
        start = int(now.timestamp()) - KEEP_DAYS * 86400
    end = int(now.timestamp())
    if start >= end:
        return {"ran": False, "reason": "没有新的时间窗"}
    try:
        saved = _pull(start, end)
        refreshed = _refresh_open(now)
        pruned = db.prune_leaves((now - timedelta(days=KEEP_DAYS)).isoformat(timespec="seconds"))
    except wecom.WeComError as exc:
        db.set_settings({"leave_sync_fail_at": str(end + FAIL_WAIT)})
        log.warning("leave sync failed: %s", exc)
        return {"ran": False, "reason": str(exc)}
    db.set_settings({"leave_sync_at": str(end), "leave_sync_fail_at": ""})
    log.info("leave sync saved=%s refreshed=%s pruned=%s", saved, refreshed, pruned)
    return {"ran": True, "saved": saved, "refreshed": refreshed, "pruned": pruned}


def _pull(start, end):
    saved = 0
    cursor = start
    while cursor < end:
        chunk_end = min(end, cursor + CHUNK_SECONDS)
        for sp_no in wecom.list_approval_numbers(cursor, chunk_end):
            if _save_detail(sp_no):
                saved += 1
        cursor = chunk_end
    return saved


def _refresh_open(now):
    since = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    count = 0
    for sp_no in db.list_leaves_to_refresh(since):
        if _save_detail(sp_no):
            count += 1
    return count


def _save_detail(sp_no):
    info = wecom.get_approval_detail(sp_no)
    parsed = wecom.parse_leave_approval(info)
    if not parsed or not parsed["sp_no"]:
        return False
    if parsed["sp_status"] in DROPPED:
        db.delete_leave(parsed["sp_no"])
        return True
    db.upsert_leave(parsed)
    return True
