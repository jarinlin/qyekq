import httpx
from datetime import datetime
from zoneinfo import ZoneInfo

from qyebot import cache, db

API = "https://qyapi.weixin.qq.com/cgi-bin"

HINTS = {
    40001: "Secret 不正确，或应用已被停用。",
    40013: "企业 ID 不正确。",
    40014: "访问令牌失效，已尝试刷新。",
    42001: "访问令牌过期，已尝试刷新。",
    60011: "应用没有访问该用户或部门的权限，检查可见范围。",
    60020: "这台机器的出口 IP 不在企业微信的可信 IP 里。",
    81013: "接收人不在应用可见范围内。",
    301025: "应用没有发消息权限，或接收人不在可见范围。",
    48002: "应用没有这个接口的权限。要按打卡记录跳过，需要开通打卡权限。",
}


class WeComError(Exception):
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def _fail(data):
    code = data.get("errcode", -1)
    if code == 0:
        return data
    message = data.get("errmsg") or "企业微信接口返回错误"
    hint = HINTS.get(code)
    if hint:
        message = f"{message}。{hint}"
    raise WeComError(message, code)


def _configured():
    settings = db.get_settings()
    corp_id = (settings.get("corp_id") or "").strip()
    secret = (settings.get("secret") or "").strip()
    agent_id = (settings.get("agent_id") or "").strip()
    if not corp_id or not secret or not agent_id:
        raise WeComError("企业 ID、AgentId、Secret 还没填全")
    return settings, corp_id, secret, agent_id


def get_token(force=False):
    settings, corp_id, secret, _agent_id = _configured()
    key = f"qyebot:token:{corp_id}"
    if not force:
        cached = cache.get(key)
        if cached:
            return cached
    try:
        response = httpx.get(
            f"{API}/gettoken",
            params={"corpid": corp_id, "corpsecret": secret},
            timeout=10,
        )
        data = response.json()
    except httpx.HTTPError as exc:
        raise WeComError("连不上企业微信接口") from exc
    _fail(data)
    token = data["access_token"]
    ttl = max(60, int(data.get("expires_in") or 7200) - 200)
    cache.set(key, token, ttl)
    return token


def _request(method, path, *, params=None, payload=None, retry=True):
    settings, corp_id, _secret, _agent_id = _configured()
    token = get_token()
    query = {"access_token": token}
    if params:
        query.update(params)
    try:
        response = httpx.request(
            method,
            f"{API}/{path}",
            params=query,
            json=payload,
            timeout=15,
        )
        data = response.json()
    except httpx.HTTPError as exc:
        raise WeComError("连不上企业微信接口") from exc
    if data.get("errcode") in (40014, 42001) and retry:
        cache.delete(f"qyebot:token:{corp_id}")
        get_token(force=True)
        return _request(method, path, params=params, payload=payload, retry=False)
    return _fail(data)


def test_connection():
    _settings, _corp_id, _secret, agent_id = _configured()
    get_token(force=True)
    data = _request("GET", "agent/get", params={"agentid": agent_id})
    name = data.get("name") or ""
    message = f"已连通，应用「{name}」" if name else "已连通"
    db.set_settings(
        {
            "last_test_ok": "1",
            "last_test_at": db.now_iso(),
            "last_test_message": message,
        }
    )
    return {"ok": True, "agent_name": name, "message": message}


def send_text(userid, content):
    _settings, _corp_id, _secret, agent_id = _configured()
    data = _request(
        "POST",
        "message/send",
        payload={
            "touser": userid,
            "msgtype": "text",
            "agentid": int(agent_id),
            "text": {"content": content[:2048]},
            "safe": 0,
        },
    )
    invalid = data.get("invaliduser") or ""
    if invalid:
        raise WeComError(f"用户不在应用可见范围内：{invalid}", 81013)
    return data.get("msgid") or ""


def sync_users():
    settings, _corp_id, _secret, _agent_id = _configured()
    department_id = (settings.get("sync_department_id") or "1").strip() or "1"
    data = _request(
        "GET",
        "user/simplelist",
        params={"department_id": department_id, "fetch_child": 1},
    )
    departments = {}
    try:
        listing = _request("GET", "department/list")
        for item in listing.get("department") or []:
            departments[item.get("id")] = item.get("name") or str(item.get("id"))
    except WeComError:
        departments = {}
    rows = []
    for user in data.get("userlist") or []:
        userid = user.get("userid") or ""
        names = []
        for item in user.get("department") or []:
            names.append(departments.get(item) or str(item))
        rows.append(
            {
                "userid": userid,
                "name": user.get("name") or userid,
                "department": " / ".join(names),
            }
        )
    result = db.upsert_people(rows)
    if result["total"] == 0:
        result["message"] = "没有拉到人。确认应用可见范围，以及部门 ID 是否正确。"
    else:
        result["message"] = f"新增 {result['created']} 人，更新 {result['updated']} 人"
    return result


def get_checkins(userids, start_ts, end_ts):
    result = {userid: {"in": False, "out": False} for userid in userids}
    for index in range(0, len(userids), 100):
        chunk = userids[index : index + 100]
        data = _request(
            "POST",
            "checkin/getcheckindata",
            payload={
                "opencheckindatatype": 3,
                "starttime": int(start_ts),
                "endtime": int(end_ts),
                "useridlist": chunk,
            },
        )
        for item in data.get("checkindata") or []:
            userid = item.get("userid")
            if userid not in result:
                continue
            exception = item.get("exception_type") or ""
            if "未打卡" in exception:
                continue
            checkin_type = item.get("checkin_type") or ""
            if "下班" in checkin_type:
                result[userid]["out"] = True
            elif "上班" in checkin_type:
                result[userid]["in"] = True
            elif "外出" in checkin_type:
                result[userid]["in"] = True
                result[userid]["out"] = True
    return result


def _leave_scope(item):
    leaves = []
    for row in item.get("sp_items") or []:
        try:
            kind = int(row.get("type") or 0)
            count = int(row.get("count") or 0)
            duration = int(row.get("duration") or 0)
            time_type = int(row.get("time_type") or 0)
        except (TypeError, ValueError):
            continue
        if kind == 1 and (count > 0 or duration > 0):
            leaves.append((duration, time_type))
    if not leaves:
        return ""
    try:
        standard = int((item.get("summary_info") or {}).get("standard_work_sec") or 0)
    except (TypeError, ValueError):
        standard = 0
    duration = sum(value for value, _time_type in leaves)
    if any(time_type == 0 and value >= 86400 for value, time_type in leaves):
        return "all"
    if standard and duration >= int(standard * 0.9):
        return "all"
    texts = []
    for info in item.get("holiday_infos") or []:
        for block in (info.get("sp_title"), info.get("sp_description")):
            for part in (block or {}).get("data") or []:
                texts.append(part.get("text") or "")
    blob = " ".join(texts)
    morning = "上午" in blob
    afternoon = "下午" in blob
    if morning and not afternoon:
        return "in"
    if afternoon and not morning:
        return "out"
    return "all"


def get_leaves(userids, start_ts, end_ts):
    wanted = set(userids)
    result = {}
    for index in range(0, len(userids), 100):
        chunk = userids[index : index + 100]
        data = _request(
            "POST",
            "checkin/getcheckin_daydata",
            payload={
                "starttime": int(start_ts),
                "endtime": int(end_ts),
                "useridlist": chunk,
            },
        )
        for item in data.get("datas") or []:
            base = item.get("base_info") or {}
            userid = base.get("acctid") or base.get("userid") or ""
            if userid not in wanted:
                continue
            scope = _leave_scope(item)
            if scope:
                result[userid] = scope
    return result


def list_approval_numbers(start_ts, end_ts):
    numbers = []
    cursor = ""
    legacy = False
    while True:
        payload = {
            "starttime": int(start_ts),
            "endtime": int(end_ts),
            "size": 100,
        }
        if legacy:
            payload["cursor"] = int(cursor or 0)
        else:
            payload["new_cursor"] = cursor
        data = _request("POST", "oa/getapprovalinfo", payload=payload)
        batch = [str(item) for item in (data.get("sp_no_list") or [])]
        numbers.extend(batch)
        nxt = data.get("new_next_cursor") or ""
        if nxt and nxt != cursor:
            cursor = nxt
            continue
        old = data.get("next_cursor")
        if old not in (None, 0, "0", "") and str(old) != str(cursor):
            legacy = True
            cursor = old
            continue
        break
    return numbers


def get_approval_detail(sp_no):
    data = _request("POST", "oa/getapprovaldetail", payload={"sp_no": str(sp_no)})
    return data.get("info") or {}


def parse_leave_approval(info):
    contents = ((info.get("apply_data") or {}).get("contents")) or []
    span = None
    for content in contents:
        if content.get("control") != "Vacation":
            continue
        vacation = (content.get("value") or {}).get("vacation") or {}
        attendance = vacation.get("attendance") or {}
        try:
            attendance_type = int(attendance.get("type") or 1)
        except (TypeError, ValueError):
            attendance_type = 1
        if attendance_type != 1:
            continue
        date_range = attendance.get("date_range") or {}
        begin = date_range.get("new_begin") or date_range.get("begin")
        end = date_range.get("new_end") or date_range.get("end")
        if not begin or not end:
            continue
        name = ""
        options = ((vacation.get("selector") or {}).get("options")) or []
        if options:
            values = options[0].get("value") or []
            if values:
                name = values[0].get("text") or ""
        span = (int(begin), int(end), name)
        break
    if not span:
        return None
    userid = ((info.get("applyer") or {}).get("userid")) or ""
    if not userid:
        return None
    begin, end, name = span
    try:
        status = int(info.get("sp_status") or 0)
    except (TypeError, ValueError):
        status = 0
    apply_time = int(info.get("apply_time") or begin)
    tz = ZoneInfo("Asia/Shanghai")
    return {
        "sp_no": str(info.get("sp_no") or ""),
        "userid": userid,
        "sp_status": status,
        "leave_start": datetime.fromtimestamp(begin, tz).isoformat(timespec="seconds"),
        "leave_end": datetime.fromtimestamp(end, tz).isoformat(timespec="seconds"),
        "leave_name": name,
        "apply_time": datetime.fromtimestamp(apply_time, tz).isoformat(timespec="seconds"),
    }
