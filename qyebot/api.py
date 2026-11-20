import re
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from qyebot import db, engine, leaves, wecom
from qyebot.auth import COOKIE, ITERATIONS, check_proof, issue_nonce, issue_token, login_blocked, note_login, revoke_session, salt_for

router = APIRouter()
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class PersonnelIn(BaseModel):
    userid: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=64)
    department: str = Field(default="", max_length=400)
    mobile: str = Field(default="", max_length=32)
    enabled: bool = True


class DirectoryAddIn(BaseModel):
    userids: list[str] = Field(min_length=1)


class EnabledIn(BaseModel):
    enabled: bool


class ScheduleIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    personnel_id: int | None = None
    clock_in: str
    clock_out: str
    weekdays: str = "1,2,3,4,5"
    timezone: str = "Asia/Shanghai"
    skip_holidays: bool = True
    is_default: bool = False
    enabled: bool = True


class RuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    kind: str
    schedule_id: int | None = None
    target_mode: str = "all"
    target_ids: list[int] = []
    offset_minutes: int = -15
    repeat_every_minutes: int = 0
    repeat_max: int = 1
    grace_minutes: int = 20
    require_not_checked: bool = True
    template: str = Field(min_length=1, max_length=800)
    enabled: bool = True


class HolidayIn(BaseModel):
    day: str
    name: str = Field(min_length=1, max_length=40)
    is_workday: bool = False


class WecomIn(BaseModel):
    corp_id: str = Field(min_length=1, max_length=64)
    agent_id: str = Field(min_length=1, max_length=16)
    secret: str = ""
    leave_sync_time: str = ""
    leave_sync_times: list[str] = []


class SchedulerIn(BaseModel):
    enabled: bool


class TestIn(BaseModel):
    personnel_id: int
    content: str = Field(min_length=1, max_length=800)


def _missing(name):
    raise HTTPException(404, f"找不到这个{name}")


def _check_clocks(clock_in, clock_out):
    if not TIME_RE.match(clock_in or ""):
        raise HTTPException(400, "上班时间用 24 小时制，例如 09:00")
    if not TIME_RE.match(clock_out or ""):
        raise HTTPException(400, "下班时间用 24 小时制，例如 18:30")
    if clock_out <= clock_in:
        raise HTTPException(400, "下班时间要晚于上班时间。跨天班次这版先不做。")


def _check_weekdays(value):
    parts = []
    for item in (value or "").split(","):
        item = item.strip()
        if not item:
            continue
        if item not in {"1", "2", "3", "4", "5", "6", "7"}:
            raise HTTPException(400, "工作日只能是周一到周日")
        if item not in parts:
            parts.append(item)
    if not parts:
        raise HTTPException(400, "至少选一个工作日")
    return ",".join(parts)


def _check_timezone(value):
    try:
        ZoneInfo(value)
    except Exception as exc:
        raise HTTPException(400, "时区写得不对，例如 Asia/Shanghai") from exc
    return value


def _prepare_schedule(body: ScheduleIn):
    _check_clocks(body.clock_in, body.clock_out)
    data = body.model_dump()
    data["name"] = body.name.strip()
    data["weekdays"] = _check_weekdays(body.weekdays)
    data["timezone"] = _check_timezone((body.timezone or "Asia/Shanghai").strip())
    if data["personnel_id"] is not None and not db.get_person(data["personnel_id"]):
        raise HTTPException(400, "这个班次绑定的人员不存在")
    if data["is_default"] and data["personnel_id"] is not None:
        raise HTTPException(400, "只有全员班次才能设为默认")
    return data


def _prepare_rule(body: RuleIn):
    if body.kind not in {"clock_in", "clock_out"}:
        raise HTTPException(400, "提醒类型只能是上班或下班")
    if body.target_mode not in {"all", "selected"}:
        raise HTTPException(400, "适用人员要选全部，或指定人员")
    if body.offset_minutes < -240 or body.offset_minutes > 360:
        raise HTTPException(400, "相对时间要在提前 240 分钟到延后 360 分钟之间")
    if body.repeat_every_minutes:
        every, repeat_max = 15, 2
    else:
        every, repeat_max = 0, 1
    if body.target_mode == "selected" and not body.target_ids:
        raise HTTPException(400, "指定人员时至少选一个人")
    known = {person["id"] for person in db.list_personnel()}
    target_ids = []
    for person_id in body.target_ids:
        if person_id not in known:
            raise HTTPException(400, "有选中的人员不存在")
        if person_id not in target_ids:
            target_ids.append(person_id)
    if body.schedule_id is not None and not db.get_schedule(body.schedule_id):
        raise HTTPException(400, "绑定的班次不存在")
    data = body.model_dump()
    data["name"] = body.name.strip()
    data["template"] = body.template.strip()
    data["repeat_every_minutes"] = every
    data["repeat_max"] = repeat_max
    data["grace_minutes"] = 60
    data["target_ids"] = target_ids if body.target_mode == "selected" else []
    if not data["template"]:
        raise HTTPException(400, "先写提醒文案")
    return data


def _clocks(values):
    try:
        found = leaves.parse_sync_clocks(values)
    except ValueError:
        raise HTTPException(400, "同步时间要写成 时:分，例如 06:30") from None
    if not found:
        raise HTTPException(400, "至少留一个同步时间")
    if len(found) > 48:
        raise HTTPException(400, "一天最多 48 个同步时间")
    return ",".join(f"{hour:02d}:{minute:02d}" for hour, minute in found)


def _public_wecom():
    settings = db.get_settings()
    secret = settings.get("secret") or ""
    tested = settings.get("last_test_ok")
    return {
        "corp_id": settings.get("corp_id") or "",
        "agent_id": settings.get("agent_id") or "",
        "secret_set": bool(secret),
        "secret_hint": secret[-4:] if len(secret) >= 4 else "",
        "leave_sync_times": leaves.format_sync_clocks(settings.get("leave_sync_time")),
        "leave_sync_at": settings.get("leave_sync_at") or "",
        "last_test_ok": True if tested == "1" else False if tested == "0" else None,
        "last_test_at": settings.get("last_test_at") or "",
        "last_test_message": settings.get("last_test_message") or "",
        "scheduler_enabled": settings.get("scheduler_enabled", "1") != "0",
        "redis_ok": False,
    }


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=64, max_length=64)
    nonce: str = Field(min_length=16, max_length=64)
    remember: bool = False


def _set_session(response: Response, request: Request, token: str, ttl: int, remember: bool):
    response.set_cookie(
        COOKIE,
        token,
        max_age=ttl if remember else None,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


@router.get("/auth/salt")
def auth_salt(username: str = ""):
    name = username.strip()
    if login_blocked(name):
        raise HTTPException(status_code=429, detail="试得太勤，请稍后再试")
    return {"salt": salt_for(name), "iterations": ITERATIONS, "nonce": issue_nonce()}


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    name = body.username.strip()
    if login_blocked(name):
        raise HTTPException(status_code=429, detail="试得太勤，请稍后再试")
    if not check_proof(name, body.password.strip().lower(), body.nonce.strip()):
        note_login(name, False)
        raise HTTPException(status_code=401, detail="账号或密码不对")
    note_login(name, True)
    token, ttl = issue_token(body.remember)
    _set_session(response, request, token, ttl, body.remember)
    return {"username": name}


@router.post("/auth/logout")
def logout(response: Response):
    revoke_session()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/session")
def auth_session():
    return {"username": db.get_settings().get("auth_user") or ""}


@router.get("/health")
def health():
    from qyebot import cache

    settings = db.get_settings()
    return {
        "ok": True,
        "redis": cache.ping(),
        "scheduler_enabled": settings.get("scheduler_enabled", "1") != "0",
        "last_tick": engine.runtime["last_tick"],
    }


@router.get("/dashboard")
def dashboard():
    return engine.dashboard()


@router.get("/settings/wecom")
def get_wecom():
    from qyebot import cache

    data = _public_wecom()
    data["redis_ok"] = cache.ping()
    return data


@router.put("/settings/wecom")
def put_wecom(body: WecomIn):
    corp_id = body.corp_id.strip()
    agent_id = body.agent_id.strip()
    if not agent_id.isdigit():
        raise HTTPException(400, "AgentId 应该是数字")
    leave_sync_time = _clocks(body.leave_sync_times or body.leave_sync_time)
    current = db.get_settings()
    secret = body.secret.strip()
    if not secret:
        secret = current.get("secret") or ""
    if not secret:
        raise HTTPException(400, "第一次保存要填写 Secret")
    saved = {
        "corp_id": corp_id,
        "agent_id": agent_id,
        "secret": secret,
        "leave_sync_time": leave_sync_time,
    }
    db.set_settings(saved)
    from qyebot import cache

    cache.delete(f"qyebot:token:{corp_id}")
    return _public_wecom()


@router.post("/settings/wecom/test")
def test_wecom():
    try:
        return wecom.test_connection()
    except wecom.WeComError as exc:
        db.set_settings(
            {
                "last_test_ok": "0",
                "last_test_at": db.now_iso(),
                "last_test_message": str(exc),
            }
        )
        raise HTTPException(502, str(exc)) from exc


@router.put("/settings/scheduler")
def put_scheduler(body: SchedulerIn):
    db.set_settings({"scheduler_enabled": "1" if body.enabled else "0"})
    return {"enabled": body.enabled}


@router.post("/scheduler/tick")
def run_tick():
    try:
        return engine.tick()
    except wecom.WeComError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/personnel")
def get_personnel():
    return {"items": db.list_personnel(), "directory": db.list_directory()}


@router.post("/personnel")
def post_personnel(body: DirectoryAddIn):
    result = db.add_from_directory(body.userids)
    if result["added"] == 0:
        raise HTTPException(400, "缓存里没有可添加的新人")
    return result


@router.put("/personnel/{person_id}")
def put_personnel(person_id: int, body: PersonnelIn):
    current = db.get_person(person_id)
    if not current:
        _missing("人员")
    data = body.model_dump()
    data["userid"] = current["userid"]
    data["name"] = current["name"]
    data["department"] = current["department"]
    try:
        row = db.update_person(person_id, data)
    except Exception as exc:
        if "UNIQUE" in str(exc):
            raise HTTPException(400, "这个账号已经有了") from exc
        raise
    if not row:
        _missing("人员")
    return row


@router.patch("/personnel/{person_id}")
def patch_personnel(person_id: int, body: EnabledIn):
    if not db.set_enabled("personnel", person_id, body.enabled):
        _missing("人员")
    return db.get_person(person_id)


@router.delete("/personnel/{person_id}")
def remove_personnel(person_id: int):
    if not db.delete_person(person_id):
        _missing("人员")
    return {"ok": True}


@router.post("/approvals/sync")
def sync_approvals():
    return leaves.run_sync()


@router.post("/personnel/sync")
def sync_personnel():
    try:
        result = wecom.sync_users()
    except wecom.WeComError as exc:
        db.set_settings({"directory_sync_fail_at": str(int(datetime.now(ZoneInfo("Asia/Shanghai")).timestamp()) + 30 * 60)})
        raise HTTPException(502, str(exc)) from exc
    db.set_settings({
        "directory_sync_at": str(int(datetime.now(ZoneInfo("Asia/Shanghai")).timestamp())),
        "directory_sync_fail_at": "",
    })
    return result


@router.get("/schedules")
def get_schedules():
    return {"items": db.list_schedules(), "holidays": db.list_holidays()}


@router.post("/schedules")
def post_schedule(body: ScheduleIn):
    return db.create_schedule(_prepare_schedule(body))


@router.put("/schedules/{schedule_id}")
def put_schedule(schedule_id: int, body: ScheduleIn):
    row = db.update_schedule(schedule_id, _prepare_schedule(body))
    if not row:
        _missing("班次")
    return row


@router.patch("/schedules/{schedule_id}")
def patch_schedule(schedule_id: int, body: EnabledIn):
    if not db.set_enabled("schedules", schedule_id, body.enabled):
        _missing("班次")
    return db.get_schedule(schedule_id)


@router.delete("/schedules/{schedule_id}")
def remove_schedule(schedule_id: int):
    if db.count_rules_for_schedule(schedule_id):
        raise HTTPException(400, "还有提醒规则绑着这个班次，先改规则再删")
    if not db.delete_schedule(schedule_id):
        _missing("班次")
    return {"ok": True}


@router.get("/rules")
def get_rules():
    return {
        "items": db.list_rules(),
        "personnel": db.list_personnel(),
        "schedules": db.list_schedules(),
    }


@router.post("/rules")
def post_rule(body: RuleIn):
    return db.create_rule(_prepare_rule(body))


@router.put("/rules/{rule_id}")
def put_rule(rule_id: int, body: RuleIn):
    row = db.update_rule(rule_id, _prepare_rule(body))
    if not row:
        _missing("提醒规则")
    return row


@router.patch("/rules/{rule_id}")
def patch_rule(rule_id: int, body: EnabledIn):
    if not db.set_enabled("reminder_rules", rule_id, body.enabled):
        _missing("提醒规则")
    return db.get_rule(rule_id)


@router.delete("/rules/{rule_id}")
def remove_rule(rule_id: int):
    if not db.delete_rule(rule_id):
        _missing("提醒规则")
    return {"ok": True}


@router.get("/holidays")
def get_holidays():
    return {"items": db.list_holidays()}


@router.post("/holidays")
def post_holiday(body: HolidayIn):
    if not DAY_RE.match(body.day):
        raise HTTPException(400, "日期写成 2026-11-17 这样")
    try:
        datetime.strptime(body.day, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(400, "这个日期不存在") from exc
    return db.upsert_holiday(body.model_dump())


@router.delete("/holidays/{holiday_id}")
def remove_holiday(holiday_id: int):
    if not db.delete_holiday(holiday_id):
        _missing("假日")
    return {"ok": True}


@router.get("/logs")
def get_logs(page: int = 1, page_size: int = 10, status: str = "", q: str = ""):
    if status and status not in {"sent", "skipped", "failed"}:
        raise HTTPException(400, "状态不对")
    if page_size not in {10, 20, 50, 100}:
        page_size = 10
    q = q.strip()[:80]
    return db.list_logs(page, page_size, status or None, q or None)


@router.post("/messages/test")
def test_message(body: TestIn):
    person = db.get_person(body.personnel_id)
    if not person:
        _missing("人员")
    content = body.content.strip()
    slot_at = datetime.now().astimezone().isoformat(timespec="milliseconds")
    try:
        msgid = wecom.send_text(person["userid"], content)
    except wecom.WeComError as exc:
        db.save_log(
            personnel_id=person["id"],
            userid=person["userid"],
            person_name=person["name"],
            rule_id=None,
            rule_name="手动测试",
            kind="clock_in",
            slot_at=slot_at,
            status="failed",
            detail=str(exc),
        )
        raise HTTPException(502, str(exc)) from exc
    db.save_log(
        personnel_id=person["id"],
        userid=person["userid"],
        person_name=person["name"],
        rule_id=None,
        rule_name="手动测试",
        kind="clock_in",
        slot_at=slot_at,
        status="sent",
        detail="",
        msgid=msgid,
    )
    return {"ok": True, "msgid": msgid}
