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


def _department_roots(items):
    ids = {item.get("id") for item in items if item.get("id") is not None}
    roots = [
        item.get("id")
        for item in items
        if item.get("id") is not None and item.get("parentid") not in ids
    ]
    return roots or list(ids)


def _department_names(user, departments):
    ids = list(user.get("department") or [])
    main = user.get("main_department")
    if main in ids:
        ids.remove(main)
        ids.insert(0, main)
    elif main:
        ids.insert(0, main)
    names = []
    for item in ids:
        label = departments.get(item) or str(item)
        if label not in names:
            names.append(label)
    return names


def _remember(seen, user, departments):
    userid = (user.get("userid") or "").strip()
    if not userid or userid in seen:
        return
    seen[userid] = {
        "userid": userid,
        "name": user.get("name") or userid,
        "department": " / ".join(_department_names(user, departments)),
    }


def _optional(method, path, **kwargs):
    try:
        return _request(method, path, **kwargs), None
    except WeComError as exc:
        return None, exc


def _pull_department(seen, department_id, departments):
    data, err = _optional(
        "GET",
        "user/simplelist",
        params={"department_id": int(department_id), "fetch_child": 1},
    )
    if data:
        for user in data.get("userlist") or []:
            _remember(seen, user, departments)
    return err


def sync_users():
    _settings, _corp_id, _secret, agent_id = _configured()
    departments = {}
    seen = {}
    last_error = None

    listing, err = _optional("GET", "department/list")
    if err:
        last_error = err
    if listing:
        items = listing.get("department") or []
        for item in items:
            departments[item.get("id")] = item.get("name") or str(item.get("id"))
        for department_id in _department_roots(items):
            err = _pull_department(seen, department_id, departments)
            if err:
                last_error = err

    agent, err = _optional("GET", "agent/get", params={"agentid": agent_id})
    if err:
        last_error = err
    if agent and not listing:
        for department_id in (agent.get("allow_partys") or {}).get("partyid") or []:
            err = _pull_department(seen, department_id, departments)
            if err:
                last_error = err
    if agent:
        users = (agent.get("allow_userinfos") or {}).get("user") or []
        for item in users:
            userid = item.get("userid")
            if not userid or userid in seen:
                continue
            detail, err = _optional("GET", "user/get", params={"userid": userid})
            if detail:
                _remember(seen, detail, departments)
            elif err:
                last_error = err
        for tag_id in (agent.get("allow_tags") or {}).get("tagid") or []:
            tag, err = _optional("GET", "tag/get", params={"tagid": tag_id})
            if err:
                last_error = err
                continue
            for user in tag.get("userlist") or []:
                _remember(seen, user, departments)
            for department_id in tag.get("partylist") or []:
                err = _pull_department(seen, department_id, departments)
                if err:
                    last_error = err

    if not seen and last_error:
        raise last_error
    result = db.save_directory(list(seen.values()), replace=last_error is None)
    if result["cached"] == 0:
        result["message"] = "没有拉到人。到企业微信里把要提醒的人加进这个应用的可见范围。"
    else:
        result["message"] = f"已缓存 {result['cached']} 人。添加人员时从这份名单里选。"
        if last_error:
            result["message"] += "有部分部门没拉下来，旧缓存还留着。"
    return result


def sync_directory_if_due():
    from qyebot import leaves

    settings = db.get_settings()
    if not (settings.get("corp_id") and settings.get("agent_id") and settings.get("secret")):
        return {"ran": False, "reason": "企业微信还没配置"}
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    failed_raw = (settings.get("directory_sync_fail_at") or "").strip()
    if failed_raw.isdigit() and int(now.timestamp()) < int(failed_raw):
        return {"ran": False, "reason": "上次同步失败，稍后再试"}
    raw_clocks = settings.get("leave_sync_time")
    due = leaves.latest_due(now, raw_clocks)
    if due is None:
        return {"ran": False, "reason": f"还没到今天 {leaves.next_clock_label(now, raw_clocks)}"}
    last_raw = (settings.get("directory_sync_at") or "").strip()
    if last_raw.isdigit() and datetime.fromtimestamp(int(last_raw), ZoneInfo("Asia/Shanghai")) >= due:
        return {"ran": False, "reason": f"今天 {due.strftime('%H:%M')} 已经同步过"}
    try:
        result = sync_users()
    except WeComError as exc:
        db.set_settings({"directory_sync_fail_at": str(int(now.timestamp()) + 30 * 60)})
        return {"ran": False, "reason": str(exc)}
    db.set_settings({"directory_sync_at": str(int(now.timestamp())), "directory_sync_fail_at": ""})
    result["ran"] = True
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


def list_approval_numbers(start_ts, end_ts, template_id="", record_type=""):
    numbers = []
    cursor = ""
    legacy = False
    filters = []
    if template_id:
        filters.append({"key": "template_id", "value": template_id})
    if record_type:
        filters.append({"key": "record_type", "value": str(record_type)})
    while True:
        payload = {
            "starttime": int(start_ts),
            "endtime": int(end_ts),
            "size": 100,
        }
        if filters:
            payload["filters"] = filters
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


ABSENCE_KIND = {1: "leave", 3: "trip", 4: "out"}
ABSENCE_NAME = {"leave": "请假", "trip": "出差", "out": "外出"}


def _unix_pair(begin, end):
    if not begin or not end:
        return None
    try:
        return int(begin), int(end)
    except (TypeError, ValueError):
        return None


def _range_pair(date_range):
    date_range = date_range or {}
    return _unix_pair(date_range.get("new_begin") or date_range.get("begin"), date_range.get("new_end") or date_range.get("end"))


def _absence_span(attendance):
    try:
        attendance_type = int((attendance or {}).get("type") or 0)
    except (TypeError, ValueError):
        return None
    kind = ABSENCE_KIND.get(attendance_type)
    pair = _range_pair((attendance or {}).get("date_range"))
    if not kind or not pair:
        return None
    return kind, pair[0], pair[1]


def _vacation_name(vacation):
    options = ((vacation.get("selector") or {}).get("options")) or []
    if not options:
        return ""
    values = options[0].get("value") or []
    if not values:
        return ""
    return values[0].get("text") or ""


def _named_kind(kind, name):
    if "出差" in name:
        return "trip"
    if "外出" in name:
        return "out"
    return kind


def _approval_spans(info):
    spans = []
    _collect_spans(((info.get("apply_data") or {}).get("contents")) or [], spans)
    return spans


def _collect_spans(contents, spans):
    for content in contents or []:
        control = content.get("control")
        value = content.get("value") or {}
        if control == "Vacation":
            vacation = value.get("vacation") or {}
            span = _absence_span(vacation.get("attendance") or {})
            if not span:
                continue
            name = _vacation_name(vacation)
            kind = _named_kind(span[0], name)
            spans.append((kind, span[1], span[2], name or ABSENCE_NAME.get(kind, "")))
        elif control == "Attendance":
            span = _absence_span(value.get("attendance") or {})
            if not span:
                continue
            kind = _named_kind(span[0], "")
            spans.append((kind, span[1], span[2], ABSENCE_NAME.get(kind, "")))
        elif control == "DateRange":
            pair = _range_pair(value.get("date_range"))
            if pair:
                spans.append(("", pair[0], pair[1], ""))
        elif control == "Table":
            for child in value.get("children") or []:
                _collect_spans(child.get("list") or [], spans)


def parse_leave_approval(info, force_kind=""):
    spans = _approval_spans(info)
    found = None
    if force_kind:
        for item in spans:
            if item[0] == force_kind:
                found = item
                break
        if not found and spans:
            kind_name = ABSENCE_NAME.get(force_kind, "")
            found = (force_kind, spans[0][1], spans[0][2], spans[0][3] or kind_name)
    else:
        for item in spans:
            if item[0]:
                found = item
                break
    if not found:
        return None
    userid = ((info.get("applyer") or {}).get("userid")) or ""
    if not userid:
        return None
    kind, begin, end, name = found
    if not force_kind:
        kind = _named_kind(kind, f"{name}{info.get('sp_name') or ''}")
        name = name or ABSENCE_NAME.get(kind, "")
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
        "kind": kind,
        "apply_time": datetime.fromtimestamp(apply_time, tz).isoformat(timespec="seconds"),
    }
