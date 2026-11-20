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


def parse_sync_clocks(raw):
    if isinstance(raw, (list, tuple)):
        pieces = [str(item) for item in raw]
    else:
        text = str(raw or "").replace("，", ",").replace("、", ",").replace(";", ",").replace("；", ",")
        pieces = text.split(",")
    found = []
    seen = set()
    for part in pieces:
        part = part.strip()
        if not part:
            continue
        bits = part.split(":")
        if len(bits) < 2 or not bits[0].isdigit() or not bits[1].isdigit():
            raise ValueError(part)
        hour, minute = int(bits[0]), int(bits[1])
        if hour > 23 or minute > 59:
            raise ValueError(part)
        key = (hour, minute)
        if key in seen:
            continue
        seen.add(key)
        found.append(key)
    found.sort()
    return found


def sync_clocks(raw):
    try:
        found = parse_sync_clocks(raw)
    except ValueError:
        return [DEFAULT_CLOCK]
    return found or [DEFAULT_CLOCK]


def format_sync_clocks(raw):
    return [f"{hour:02d}:{minute:02d}" for hour, minute in sync_clocks(raw)]


def latest_due(now, raw):
    passed = []
    for hour, minute in sync_clocks(raw):
        moment = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if now >= moment:
            passed.append(moment)
    return passed[-1] if passed else None


def next_clock_label(now, raw):
    for hour, minute in sync_clocks(raw):
        moment = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if now < moment:
            return f"{hour:02d}:{minute:02d}"
    hour, minute = sync_clocks(raw)[0]
    return f"{hour:02d}:{minute:02d}"


def _window(now, settings):
    end = int(now.timestamp())
    widened = (settings.get("absence_record_sync") or "") == "1"
    last_raw = (settings.get("leave_sync_at") or "").strip()
    if widened and last_raw.isdigit():
        start = max(int(last_raw) - OVERLAP_SECONDS, end - KEEP_DAYS * 86400)
        return start, end, False
    return end - KEEP_DAYS * 86400, end, True


def run_sync(now=None):
    settings = db.get_settings()
    if not (settings.get("corp_id") and settings.get("agent_id") and settings.get("secret")):
        return {"ran": False, "reason": "企业微信还没配置"}
    now = now or datetime.now(TZ)
    start, end, first = _window(now, settings)
    if start >= end:
        return {"ran": False, "reason": "没有新的时间窗"}
    try:
        saved = _pull_all(start, end)
        refreshed = _refresh_open(now)
        pruned = db.prune_leaves((now - timedelta(days=KEEP_DAYS)).isoformat(timespec="seconds"))
    except wecom.WeComError as exc:
        db.set_settings({"leave_sync_fail_at": str(end + FAIL_WAIT)})
        log.warning("leave sync failed: %s", exc)
        return {"ran": False, "reason": str(exc)}
    db.set_settings({"leave_sync_at": str(end), "leave_sync_fail_at": "", "absence_record_sync": "1"})
    if first and (settings.get("leave_sync_at") or "").strip().isdigit():
        message = f"出差和外出改为按假勤类型拉取，这次重新补近 {KEEP_DAYS} 天，处理 {saved} 条。"
    elif first:
        message = f"还没有成功记录，先补近 {KEEP_DAYS} 天，处理 {saved} 条。之后再同步都从上次成功时间接着拉。"
    else:
        message = f"已从上次成功时间增量拉取，处理 {saved} 条。"
    log.info("leave sync saved=%s refreshed=%s pruned=%s first=%s", saved, refreshed, pruned, first)
    return {"ran": True, "saved": saved, "refreshed": refreshed, "pruned": pruned, "first": first, "message": message}


def sync_if_due():
    settings = db.get_settings()
    if not (settings.get("corp_id") and settings.get("agent_id") and settings.get("secret")):
        return {"ran": False, "reason": "企业微信还没配置"}
    now = datetime.now(TZ)
    failed_raw = (settings.get("leave_sync_fail_at") or "").strip()
    if failed_raw.isdigit() and int(now.timestamp()) < int(failed_raw):
        return {"ran": False, "reason": "上次拉取失败，稍后再试"}
    raw_clocks = settings.get("leave_sync_time")
    due = latest_due(now, raw_clocks)
    if due is None:
        return {"ran": False, "reason": f"还没到今天 {next_clock_label(now, raw_clocks)}"}
    clock = due.strftime("%H:%M")
    last_raw = (settings.get("leave_sync_at") or "").strip()
    if last_raw.isdigit() and datetime.fromtimestamp(int(last_raw), TZ) >= due:
        return {"ran": False, "reason": f"今天 {clock} 已经拉取过"}
    return run_sync(now)


def _pull_all(start, end):
    found = _pull(start, end)
    found |= _pull(start, end, record_type="3", force_kind="trip")
    found |= _pull(start, end, record_type="4", force_kind="out")
    return len(found)


def _pull(start, end, template_id="", record_type="", force_kind=""):
    found = set()
    cursor = start
    while cursor < end:
        chunk_end = min(end, cursor + CHUNK_SECONDS)
        for sp_no in wecom.list_approval_numbers(cursor, chunk_end, template_id, record_type):
            if _save_detail(sp_no, force_kind):
                found.add(sp_no)
        cursor = chunk_end
    return found


def _refresh_open(now):
    since = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
    count = 0
    for sp_no in db.list_leaves_to_refresh(since):
        if _save_detail(sp_no):
            count += 1
    return count


def _save_detail(sp_no, force_kind=""):
    info = wecom.get_approval_detail(sp_no)
    parsed = wecom.parse_leave_approval(info, force_kind)
    if not parsed or not parsed["sp_no"]:
        return False
    if parsed["sp_status"] in DROPPED:
        db.delete_leave(parsed["sp_no"])
        return True
    db.upsert_leave(parsed)
    return True
