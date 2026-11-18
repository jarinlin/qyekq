import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from qyebot import cache, db, wecom

log = logging.getLogger("qyebot")

runtime = {
    "last_tick": None,
    "last_error": None,
    "last_result": None,
}

KIND_LABEL = {"clock_in": "上班", "clock_out": "下班"}
KIND_KEY = {"clock_in": "in", "clock_out": "out"}


class SafeMap(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render_template(template, person, kind, slot, clock_time):
    values = SafeMap(
        name=person["name"],
        userid=person["userid"],
        kind=KIND_LABEL.get(kind, kind),
        time=slot.strftime("%H:%M"),
        clock_time=clock_time,
        date=slot.strftime("%Y-%m-%d"),
    )
    try:
        return template.format_map(values)
    except Exception:
        return template


def at_hm(day, hhmm, tz):
    hour, minute = [int(part) for part in hhmm.split(":")]
    return datetime(day.year, day.month, day.day, hour, minute, 0, tzinfo=tz)


def build_slots(base, offset, every, repeat_max):
    first = base + timedelta(minutes=int(offset))
    slots = [first]
    if every and repeat_max > 1:
        for step in range(1, int(repeat_max)):
            slots.append(first + timedelta(minutes=int(every) * step))
    return slots


def is_workday(day, schedule, holidays):
    key = day.isoformat()
    if schedule.get("skip_holidays") and key in holidays:
        return bool(holidays[key])
    allowed = set()
    for part in (schedule.get("weekdays") or "").split(","):
        part = part.strip()
        if part.isdigit():
            allowed.add(int(part))
    return day.isoweekday() in allowed


def resolve_schedule(person, schedules):
    personal = [
        item
        for item in schedules
        if item.get("enabled") and item.get("personnel_id") == person["id"]
    ]
    if personal:
        return personal[0]
    defaults = [
        item
        for item in schedules
        if item.get("enabled") and item.get("personnel_id") is None and item.get("is_default")
    ]
    if defaults:
        return defaults[0]
    globals_ = [
        item for item in schedules if item.get("enabled") and item.get("personnel_id") is None
    ]
    return globals_[0] if globals_ else None


def rule_applies(rule, person, schedule):
    if not rule.get("enabled"):
        return False
    if rule.get("schedule_id") and rule["schedule_id"] != schedule["id"]:
        return False
    if rule.get("target_mode") == "selected" and person["id"] not in (rule.get("target_ids") or []):
        return False
    return True


def slot_iso(moment):
    return moment.isoformat(timespec="seconds")


def due_slots(slots, now, grace, done):
    window = timedelta(minutes=int(grace))
    due = []
    for moment in slots:
        previous = done.get(slot_iso(moment))
        if previous and previous["status"] != "failed":
            continue
        if previous and previous["status"] == "failed":
            try:
                failed_at = datetime.fromisoformat(previous["sent_at"])
            except ValueError:
                failed_at = now - timedelta(minutes=10)
            if now - failed_at < timedelta(minutes=5):
                continue
        if moment <= now < moment + window:
            due.append(moment)
    return due


def slot_status(moment, now, grace, previous):
    if previous:
        return previous["status"]
    if moment > now:
        return "waiting"
    if now < moment + timedelta(minutes=int(grace)):
        return "due"
    return "missed"


def _default_schedule(schedules):
    enabled = [item for item in schedules if item.get("enabled") and item.get("personnel_id") is None]
    for item in enabled:
        if item.get("is_default"):
            return item
    return enabled[0] if enabled else None


def _public_schedule(schedule):
    if not schedule:
        return None
    return {
        "id": schedule["id"],
        "name": schedule["name"],
        "clock_in": schedule["clock_in"],
        "clock_out": schedule["clock_out"],
        "weekdays": schedule["weekdays"],
        "timezone": schedule["timezone"],
    }


def build_board():
    schedules = db.list_schedules()
    rules = db.list_rules()
    people = [person for person in db.list_personnel() if person["enabled"]]
    holidays = {item["day"]: item["is_workday"] for item in db.list_holidays()}
    default = _default_schedule(schedules)
    tzname = (default or {}).get("timezone") or "Asia/Shanghai"
    try:
        tz = ZoneInfo(tzname)
    except Exception:
        tz = ZoneInfo("Asia/Shanghai")
        tzname = "Asia/Shanghai"
    now = datetime.now(tz)
    rows = []
    upcoming = []
    for person in people:
        schedule = resolve_schedule(person, schedules)
        row = {
            "id": person["id"],
            "name": person["name"],
            "userid": person["userid"],
            "department": person["department"],
            "clock_in": schedule["clock_in"] if schedule else "",
            "clock_out": schedule["clock_out"] if schedule else "",
            "schedule_name": schedule["name"] if schedule else "",
            "workday": False,
            "slots": [],
        }
        if not schedule:
            rows.append(row)
            continue
        try:
            schedule_tz = ZoneInfo(schedule["timezone"])
        except Exception:
            rows.append(row)
            continue
        local_now = datetime.now(schedule_tz)
        local_day = local_now.date()
        if not is_workday(local_day, schedule, holidays):
            rows.append(row)
            continue
        row["workday"] = True
        existing = {}
        for item in db.logs_on(local_day.isoformat()):
            if item["userid"] == person["userid"] and item.get("rule_id") is not None:
                existing[(item["rule_id"], item["slot_at"])] = item
        for rule in rules:
            if not rule_applies(rule, person, schedule):
                continue
            clock = schedule["clock_in"] if rule["kind"] == "clock_in" else schedule["clock_out"]
            base = at_hm(local_day, clock, schedule_tz)
            for moment in build_slots(
                base,
                rule["offset_minutes"],
                rule["repeat_every_minutes"],
                rule["repeat_max"],
            ):
                previous = existing.get((rule["id"], slot_iso(moment)))
                status = slot_status(moment, local_now, rule["grace_minutes"], previous)
                slot = {
                    "rule_id": rule["id"],
                    "rule_name": rule["name"],
                    "kind": rule["kind"],
                    "time": moment.strftime("%H:%M"),
                    "at": slot_iso(moment),
                    "status": status,
                }
                row["slots"].append(slot)
                if status in {"waiting", "due"}:
                    upcoming.append({**slot, "person_name": person["name"], "userid": person["userid"]})
        rows.append(row)

    upcoming.sort(key=lambda item: item["at"])
    settings_people = db.list_personnel()
    return {
        "now": now.isoformat(timespec="seconds"),
        "timezone": tzname,
        "schedule": _public_schedule(default),
        "next": upcoming[0] if upcoming else None,
        "people": rows,
        "personnel_total": len(settings_people),
        "recent": db.list_logs(page_size=8)["items"],
    }


def dashboard():
    board = build_board()
    settings = db.get_settings()
    secret = settings.get("secret") or ""
    tested = settings.get("last_test_ok")
    board["wecom"] = {
        "configured": bool(settings.get("corp_id") and settings.get("agent_id") and secret),
        "last_test_ok": True if tested == "1" else False if tested == "0" else None,
        "last_test_at": settings.get("last_test_at") or "",
        "last_test_message": settings.get("last_test_message") or "",
    }
    board["scheduler_enabled"] = settings.get("scheduler_enabled", "1") != "0"
    board["redis_ok"] = cache.ping()
    board["last_tick"] = runtime["last_tick"]
    board["last_error"] = runtime["last_error"]
    board["last_result"] = runtime["last_result"]
    return board


def _mark(person, rule, moment, status, detail="", msgid=""):
    return db.save_log(
        personnel_id=person["id"],
        userid=person["userid"],
        person_name=person["name"],
        rule_id=rule["id"],
        rule_name=rule["name"],
        kind=rule["kind"],
        slot_at=slot_iso(moment),
        status=status,
        detail=detail,
        msgid=msgid,
    )


def tick():
    runtime["last_tick"] = db.now_iso()
    try:
        from qyebot import leaves

        leaves.sync_if_due()
    except Exception:
        log.exception("leave sync failed")
    try:
        from qyebot import wecom

        wecom.sync_directory_if_due()
    except Exception:
        log.exception("directory sync failed")
    lock = cache.acquire_lock()
    if lock is False:
        result = {"sent": 0, "skipped": 0, "failed": 0, "reason": "上一轮还在跑"}
        runtime["last_result"] = result
        return result
    try:
        result = _run()
        runtime["last_result"] = result
        runtime["last_error"] = None
        return result
    except Exception:
        runtime["last_error"] = "自动检查出错，看一下运行日志"
        log.exception("tick failed")
        raise
    finally:
        if lock is True:
            cache.release_lock()


def _run():
    settings = db.get_settings()
    if not (settings.get("corp_id") and settings.get("agent_id") and settings.get("secret")):
        return {"sent": 0, "skipped": 0, "failed": 0, "reason": "企业微信还没配置"}

    schedules = [item for item in db.list_schedules() if item["enabled"]]
    rules = [item for item in db.list_rules() if item["enabled"]]
    people = [item for item in db.list_personnel() if item["enabled"]]
    holidays = {item["day"]: item["is_workday"] for item in db.list_holidays()}
    plans = []

    for person in people:
        schedule = resolve_schedule(person, schedules)
        if not schedule:
            continue
        try:
            tz = ZoneInfo(schedule["timezone"])
        except Exception:
            continue
        now = datetime.now(tz)
        if not is_workday(now.date(), schedule, holidays):
            continue
        existing = {}
        for item in db.logs_on(now.date().isoformat()):
            if item["userid"] == person["userid"] and item["rule_id"] is not None:
                existing[(item["rule_id"], item["slot_at"])] = item
        for rule in rules:
            if not rule_applies(rule, person, schedule):
                continue
            clock = schedule["clock_in"] if rule["kind"] == "clock_in" else schedule["clock_out"]
            base = at_hm(now.date(), clock, tz)
            slots = build_slots(
                base,
                rule["offset_minutes"],
                rule["repeat_every_minutes"],
                rule["repeat_max"],
            )
            done = {}
            for moment in slots:
                previous = existing.get((rule["id"], slot_iso(moment)))
                if previous:
                    done[slot_iso(moment)] = previous
            due = due_slots(slots, now, rule["grace_minutes"], done)
            if not due:
                continue
            plans.append(
                {
                    "person": person,
                    "schedule": schedule,
                    "rule": rule,
                    "chosen": due[-1],
                    "older": due[:-1],
                    "clock": clock,
                }
            )

    checkins = None
    checkin_error = ""
    if any(plan["rule"].get("require_not_checked") for plan in plans):
        userids = sorted({plan["person"]["userid"] for plan in plans})
        start = datetime.now(ZoneInfo("Asia/Shanghai")).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1) - timedelta(seconds=1)
        try:
            checkins = wecom.get_checkins(userids, start.timestamp(), end.timestamp())
        except wecom.WeComError as exc:
            checkins = None
            checkin_error = str(exc)
            log.warning("checkin lookup failed: %s", exc)

    sent = skipped = failed = 0
    for plan in plans:
        person = plan["person"]
        rule = plan["rule"]
        for older in plan["older"]:
            state = _mark(person, rule, older, "skipped", "同一轮里有更新的提醒时点，这条不再单独发送")
            if state != "exists":
                skipped += 1
        chosen = plan["chosen"]
        work_at = chosen - timedelta(minutes=int(rule["offset_minutes"]))
        if db.on_leave(person["userid"], slot_iso(work_at)):
            state = _mark(person, rule, chosen, "skipped", "当天请假")
            if state != "exists":
                skipped += 1
            continue
        if rule.get("require_not_checked") and checkins is not None:
            record = checkins.get(person["userid"]) or {}
            if record.get(KIND_KEY.get(rule["kind"], "")):
                state = _mark(person, rule, chosen, "skipped", "已有打卡记录")
                if state != "exists":
                    skipped += 1
                continue
        note = ""
        if rule.get("require_not_checked") and checkins is None:
            note = checkin_error or "打卡记录暂时查不到，仍发送提醒"
        content = render_template(rule["template"], person, rule["kind"], chosen, plan["clock"])
        try:
            msgid = wecom.send_text(person["userid"], content)
        except wecom.WeComError as exc:
            state = _mark(person, rule, chosen, "failed", str(exc))
            if state != "exists":
                failed += 1
            log.warning("send failed userid=%s rule=%s err=%s", person["userid"], rule["name"], exc)
            continue
        detail = note
        state = _mark(person, rule, chosen, "sent", detail, msgid)
        if state != "exists":
            sent += 1
            log.info("sent userid=%s rule=%s", person["userid"], rule["name"])

    result = {"sent": sent, "skipped": skipped, "failed": failed, "reason": ""}
    if checkin_error:
        result["checkin_error"] = checkin_error
    return result
