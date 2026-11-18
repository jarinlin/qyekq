/* qyekq · 主应用控制器 (/src/assets/js/app.js) */

(() => {
const {
  esc,
  ICONS,
  kindLabel,
  sampleMessage,
  Switch,
  StatusPill,
  StatusBanner,
  PageHeader,
  EmptyState,
  RuleCard,
  ScheduleCard,
} = window.BandianUI;

const ROUTES = ["today", "people", "schedules", "logs", "connect", "login"];
const META = {
  today: ["提醒管理", "设置上下班提醒时点、接收成员与重复催办策略，到点通过企业微信自建应用自动发送。"],
  people: ["接收人员", "管理会收到企业微信上下班提醒的成员，支持手工添加或同步部门通讯录。"],
  schedules: ["作息班次", "配置默认上下班时间、适用工作日以及节假日放假与调休补班。"],
  logs: ["发送记录", "核对提醒消息是否已发出、因已打卡跳过或发送失败。"],
  connect: ["应用连接", "配置企业微信自建应用凭证，并向指定成员发送测试消息验证连通性。"],
};

const TOKEN_KEY = "qyekq_token";
const USER_KEY = "qyekq_user";

function token() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
}

function currentUser() {
  return sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY) || "qyekq";
}

function storeToken(value, remember, username) {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, value);
  store.setItem(USER_KEY, username || "qyekq");
  paintUser();
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(USER_KEY);
}

function paintUser() {
  const name = currentUser();
  const label = document.querySelector("[data-user-name]");
  const avatar = document.querySelector("[data-user]");
  if (label) label.textContent = name;
  if (avatar) avatar.textContent = name.slice(0, 1);
}

const LOG_STATUS = {
  waiting: ["未到点", ""],
  due: ["待发送", "accent"],
  sent: ["已发送", "ok"],
  skipped: ["已跳过", "warn"],
  failed: ["发送失败", "err"],
  missed: ["已错过", ""],
};

const state = {
  route: "today",
  data: null,
  logStatus: "",
  lastFocus: null,
};

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const current = token();
  if (current) headers.Authorization = `Bearer ${current}`;
  const res = await fetch("/api" + path, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (res.status === 401) {
    clearToken();
    if ((location.hash || "") !== "#/login") location.hash = "#/login";
    throw new Error(typeof data?.detail === "string" ? data.detail : "请先登录");
  }
  if (!res.ok) {
    const msg = data && (data.detail || data.message);
    throw new Error(typeof msg === "string" ? msg : "请求失败");
  }
  return data;
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3200);
}

function logStatusHtml(status, customText) {
  const [label, dot] = LOG_STATUS[status] || [status, ""];
  return `<span class="status-inline"><i class="s-dot ${dot}" aria-hidden="true"></i><span>${esc(customText || label)}</span></span>`;
}

/* ---------------- 核心视图渲染 ---------------- */

function renderReminders() {
  const data = state.data;
  const rules = data.rules || [];
  const defaultSchedule = data.schedule || null;
  const schedules = data.schedules || [];

  const cards = rules.map((rule) => RuleCard(rule, defaultSchedule, schedules)).join("");

  return `
    ${PageHeader({
      title: META.today[0],
      subtitle: META.today[1],
      actions: `<button type="button" class="btn primary" data-action="new-rule">${ICONS.plus}<span>新增提醒</span></button>`,
    })}
    ${StatusBanner(data)}
    <section class="card-list" aria-label="提醒规则列表">
      ${cards || `<article class="card">${EmptyState({
        icon: "bell",
        title: "还没有提醒规则",
        description: "创建一条上班前或下班前提醒规则，到点后将自动通过企业微信发送给启用成员。",
        action: `<button type="button" class="btn primary" data-action="new-rule">${ICONS.plus}<span>新增第一条提醒</span></button>`,
      })}</article>`}
    </section>`;
}

function renderPeople() {
  const items = state.data.items || [];
  const enabledCount = items.filter((p) => p.enabled).length;
  const rows = items.map((person) => `<tr data-person-row data-q="${esc(`${person.name} ${person.userid} ${person.department}`.toLowerCase())}">
    <td><div class="who"><b>${esc(person.name)}</b><span>${esc(person.department || "未填部门")}</span></div></td>
    <td class="mono">${esc(person.userid)}</td>
    <td class="mono">${esc(person.mobile || "—")}</td>
    <td>${Switch({
      kind: "person",
      id: person.id,
      enabled: person.enabled,
      label: `${person.enabled ? "停用" : "启用"} ${person.name}`,
    })}</td>
    <td><div class="row-actions">
      <button type="button" class="btn ghost sm" data-action="edit-person" data-id="${person.id}" aria-label="编辑 ${esc(person.name)}">${ICONS.edit}<span>编辑</span></button>
      <button type="button" class="btn ghost danger-hover sm" data-action="delete-person" data-id="${person.id}" data-name="${esc(person.name)}" aria-label="删除 ${esc(person.name)}">${ICONS.trash}<span>删除</span></button>
    </div></td>
  </tr>`).join("");

  return `
    ${PageHeader({
      title: META.people[0],
      subtitle: META.people[1],
      actions: `
        <button type="button" class="btn quiet" data-action="sync-people">${ICONS.sync}<span>同步企业微信成员</span></button>
        <button type="button" class="btn primary" data-action="new-person">${ICONS.plus}<span>添加人员</span></button>`,
    })}
    ${items.length ? `<div class="toolbar">
      <div class="search-wrap">
        ${ICONS.search}
        <input class="search-input" id="people-q" type="search" placeholder="搜索姓名、UserId 或部门..." aria-label="搜索人员" autocomplete="off">
      </div>
      <span class="hint" style="margin:0">共 ${items.length} 人，${enabledCount} 人启用中</span>
    </div>` : ""}
    <article class="card card-table">
      ${items.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>成员</th><th>账号 UserId</th><th>手机号</th><th>接收提醒</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <p class="hint" data-people-empty hidden style="padding:18px 24px">没有匹配的成员。</p>`
        : EmptyState({
            icon: "users",
            title: "还没有接收人员",
            description: "可以手工填入成员的企业微信 UserId，或在配置好自建应用后一键同步部门通讯录。",
            action: `<button type="button" class="btn primary" data-action="new-person">${ICONS.plus}<span>添加第一位成员</span></button>`,
          })}
    </article>`;
}

function renderSchedules() {
  const items = state.data.items || [];
  const holidays = state.data.holidays || [];
  const cards = items.map((item) => ScheduleCard(item)).join("");

  const holidayRows = holidays.map((item) => `<tr>
    <td class="mono">${esc(item.day)}</td>
    <td><strong style="font-weight:500;color:var(--text-primary)">${esc(item.name)}</strong></td>
    <td><span class="tag ${item.is_workday ? "tag-out" : "tag-muted"}">${item.is_workday ? "调休补班 · 照常提醒" : "放假休息 · 暂停提醒"}</span></td>
    <td><div class="row-actions">
      <button type="button" class="btn ghost danger-hover sm" data-action="delete-holiday" data-id="${item.id}" data-name="${esc(item.name)}" aria-label="删除 ${esc(item.name)}">${ICONS.trash}<span>删除</span></button>
    </div></td>
  </tr>`).join("");

  return `
    ${PageHeader({
      title: META.schedules[0],
      subtitle: META.schedules[1],
      actions: `
        <button type="button" class="btn quiet" data-action="new-holiday">${ICONS.calendar}<span>添加放假/补班</span></button>
        <button type="button" class="btn primary" data-action="new-schedule">${ICONS.plus}<span>添加班次</span></button>`,
    })}
    <section class="card-list" aria-label="班次列表">
      ${cards || `<article class="card">${EmptyState({
        icon: "clock",
        title: "还没有班次",
        description: "至少保留一个全员默认班次；如有个别成员上下班时间不同，可单独添加个人专属班次。",
        action: `<button type="button" class="btn primary" data-action="new-schedule">${ICONS.plus}<span>添加默认班次</span></button>`,
      })}</article>`}
    </section>
    <article class="card card-table" style="margin-top:24px">
      <div style="padding:18px 24px 8px">
        <div class="section-head" style="margin-bottom:4px">
          <h2 class="section-title">节假日与调休补班</h2>
        </div>
        <p class="section-desc">标记为「放假」的日期不会发送提醒；周末如需上班，标记为「补班」即可按工作日规则正常提醒。</p>
      </div>
      ${holidays.length
        ? `<div class="table-wrap" style="margin-top:8px"><table>
            <thead><tr><th>日期</th><th>节假日名称</th><th>执行方式</th><th></th></tr></thead>
            <tbody>${holidayRows}</tbody>
          </table></div>`
        : EmptyState({
            icon: "calendar",
            title: "暂无特殊日期标记",
            description: "当前全部按班次设定的星期执行。遇到法定节假日或周末补班时可在此添加。",
          })}
    </article>`;
}

function renderLogs() {
  const items = state.data.items || [];
  const filterDefs = [
    ["", "全部记录", ""],
    ["sent", "已发送", "ok"],
    ["skipped", "已跳过", "warn"],
    ["failed", "发送失败", "err"],
  ];
  const chips = filterDefs.map(([status, label, dot]) => {
    const active = state.logStatus === status ? " on" : "";
    const dotHtml = dot ? `<i class="s-dot ${dot}" aria-hidden="true"></i>` : "";
    return `<button type="button" class="chip${active}" data-action="filter-logs" data-status="${status}">${dotHtml}<span>${label}</span></button>`;
  }).join("");

  const rows = items.map((item) => `<tr>
    <td><div class="who"><b>${esc(item.person_name || item.userid)}</b><span>${esc(item.rule_name || "手动测试")}</span></div></td>
    <td class="mono">${esc(kindLabel(item.kind))} · ${esc(String(item.slot_at || "").slice(0, 16).replace("T", " "))}</td>
    <td>${logStatusHtml(item.status)}</td>
    <td title="${esc(item.detail || "")}">${esc((item.detail || "—").slice(0, 48))}</td>
  </tr>`).join("");

  return `
    ${PageHeader({
      title: META.logs[0],
      subtitle: META.logs[1],
      actions: `<button type="button" class="btn quiet" data-action="new-test">${ICONS.send}<span>发一条测试消息</span></button>`,
    })}
    <div class="filters" role="group" aria-label="按发送状态筛选">${chips}</div>
    <article class="card card-table">
      ${items.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>接收人 / 规则</th><th>计划时点</th><th>结果</th><th>说明</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : EmptyState({
            icon: "logs",
            title: state.logStatus ? "当前筛选下没有记录" : "还没有发送记录",
            description: state.logStatus ? "切换到「全部记录」查看其他状态的发送流水。" : "提醒规则到点触发或手动发送测试消息后，流水会显示在这里。",
          })}
    </article>`;
}

function renderConnect() {
  const data = state.data;
  const people = data.personnel || [];
  const configured = Boolean(data.corp_id && data.agent_id && data.secret_set);
  const options = people.map((person) => `<option value="${person.id}">${esc(person.name)} (${esc(person.userid)})</option>`).join("");

  const wecomPill = configured
    ? StatusPill({ tone: data.last_test_ok === false ? "err" : "ok", label: "凭证状态", value: data.last_test_ok === false ? "测试未通过" : "已保存" })
    : StatusPill({ tone: "warn", label: "凭证状态", value: "待填写" });

  return `
    ${PageHeader({
      title: META.connect[0],
      subtitle: META.connect[1],
      actions: `<button type="button" class="btn quiet" data-action="test-wecom">${ICONS.plug}<span>测试应用连接</span></button>`,
    })}
    <section class="split-grid">
      <article class="card">
        <div class="section-head">
          <h2 class="section-title">企业微信自建应用凭证</h2>
          ${wecomPill}
        </div>
        <p class="section-desc">自建应用需开启「发送应用消息」权限；如需自动跳过已打卡成员需开启「打卡」权限；同步成员需「通讯录读取」权限，并将本机出口 IP 加入企业微信可信 IP。</p>
        <form novalidate data-form="wecom" autocomplete="off" style="margin-top:20px">
          <label class="field">
            <span>企业 ID (CorpID)</span>
            <input name="corp_id" value="${esc(data.corp_id)}" placeholder="例如 ww1234567890abcdef" required autocomplete="off">
          </label>
          <div class="grid-2">
            <label class="field">
              <span>应用 AgentId</span>
              <input name="agent_id" value="${esc(data.agent_id)}" placeholder="例如 1000002" inputmode="numeric" required autocomplete="off">
            </label>
            <label class="field">
              <span>同步根部门 ID</span>
              <input name="sync_department_id" value="${esc(data.sync_department_id || "1")}" inputmode="numeric" required>
            </label>
          </div>
          <label class="field">
            <span>应用 Secret</span>
            <input name="secret" type="password" autocomplete="new-password" placeholder="${data.secret_set ? "已安全保存，留空表示不修改" : "粘贴自建应用 Secret"}">
          </label>
          <p class="hint">${data.secret_set ? `当前已保存 Secret（末四位 ${esc(data.secret_hint)}）。` : "Secret 仅保存在本机 SQLite 数据库中，接口不回传明文。"} ${esc(data.last_test_message || "")}</p>
          <div class="sheet-actions" style="border-top:0;padding-top:4px;margin-top:14px">
            <button class="btn primary" type="submit">保存应用配置</button>
          </div>
        </form>
      </article>

      <article class="card">
        <div class="section-head">
          <h2 class="section-title">发送测试消息</h2>
        </div>
        <p class="section-desc">保存凭证并添加至少一位人员后，可向自己发送一条真实企业微信应用消息确认链路畅通。</p>
        <form novalidate data-form="test" autocomplete="off" style="margin-top:20px">
          <label class="field">
            <span>接收人</span>
            <select name="personnel_id" required>${options || `<option value="">请先到「人员」页添加成员</option>`}</select>
          </label>
          <label class="field">
            <span>测试内容</span>
            <textarea name="content" required>这是 qyekq 的连通测试消息，收到即代表企业微信自建应用推送正常。</textarea>
          </label>
          <div class="sheet-actions" style="border-top:0;padding-top:4px;margin-top:14px">
            <button class="btn primary" type="submit" ${people.length ? "" : "disabled"}>${ICONS.send}<span>发送测试</span></button>
          </div>
        </form>
      </article>
    </section>`;
}

function renderLogin() {
  return `<div class="login-stage">
    <section class="login-hero">
      <span class="login-orbit login-orbit-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <h1>qyekq</h1>
      <p>到点，给该打卡的人发一条企业微信消息。</p>
      <div class="login-orbit" aria-hidden="true"><i></i><i></i><i></i></div>
    </section>
    <form novalidate class="login" data-form="login" autocomplete="off">
      <h2>登录</h2>
      <label class="field"><span>账号</span><input name="username" required autocomplete="username"></label>
      <label class="field"><span>密码</span><input name="password" type="password" required autocomplete="current-password"></label>
      <label class="remember"><input type="checkbox" name="remember"> 记住我</label>
      <button class="btn primary" type="submit">登录</button>
      <button type="button" class="login-fill" data-action="fill-demo">填入本机账号</button>
    </form>
  </div>`;
}

function render() {
  if (state.route === "today") return renderReminders();
  if (state.route === "people") return renderPeople();
  if (state.route === "schedules") return renderSchedules();
  if (state.route === "logs") return renderLogs();
  return renderConnect();
}

/* ---------------- 抽屉弹窗与无障碍焦点管理 ---------------- */

function openSheet(title, body) {
  state.lastFocus = document.activeElement;
  document.getElementById("sheet-root").innerHTML = `
    <div class="backdrop" data-action="close-sheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-head">
        <h2 id="sheet-title">${esc(title)}</h2>
        <button type="button" class="btn ghost sm" data-action="close-sheet" aria-label="关闭抽屉">${ICONS.close}</button>
      </div>
      ${body}
    </section>`;
  document.body.classList.add("sheet-open");
  const field = document.querySelector(".sheet input, .sheet select, .sheet textarea");
  if (field) field.focus();
}

function closeSheet() {
  const root = document.getElementById("sheet-root");
  if (!root.innerHTML) return;
  root.innerHTML = "";
  document.body.classList.remove("sheet-open");
  if (state.lastFocus && typeof state.lastFocus.focus === "function") {
    state.lastFocus.focus();
    state.lastFocus = null;
  }
}

function trapSheetFocus(event) {
  if (event.key !== "Tab" || !document.body.classList.contains("sheet-open")) return;
  const sheet = document.querySelector(".sheet");
  if (!sheet) return;
  const focusables = [...sheet.querySelectorAll(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => !el.closest("[hidden]"));
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function personForm(person) {
  const row = person || { userid: "", name: "", department: "", mobile: "", enabled: true };
  openSheet(person ? "编辑接收人员" : "添加接收人员", `
    <form novalidate data-form="person" data-id="${person ? person.id : ""}" autocomplete="off">
      <label class="field">
        <span>企业微信账号 (UserId)</span>
        <input name="userid" required maxlength="64" value="${esc(row.userid)}" placeholder="例如 zhangsan（企业微信通讯录账号）" autocomplete="off">
      </label>
      <label class="field">
        <span>姓名</span>
        <input name="name" required maxlength="64" value="${esc(row.name)}" placeholder="例如 张三" autocomplete="name">
      </label>
      <div class="grid-2">
        <label class="field">
          <span>部门（选填）</span>
          <input name="department" maxlength="120" value="${esc(row.department)}" placeholder="例如 研发部">
        </label>
        <label class="field">
          <span>手机号（选填）</span>
          <input name="mobile" maxlength="32" value="${esc(row.mobile)}" autocomplete="tel" inputmode="tel">
        </label>
      </div>
      <div class="choice">
        <label><input type="checkbox" name="enabled" ${row.enabled ? "checked" : ""}> 启用该成员的上下班提醒</label>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn quiet" data-action="close-sheet">取消</button>
        <button class="btn primary" type="submit">保存人员</button>
      </div>
    </form>`);
}

function scheduleForm(item) {
  const row = item || {
    name: "",
    personnel_id: null,
    clock_in: "09:00",
    clock_out: "18:30",
    weekdays: "1,2,3,4,5",
    timezone: "Asia/Shanghai",
    skip_holidays: true,
    is_default: false,
    enabled: true,
  };
  const selected = new Set(String(row.weekdays).split(","));
  const days = ["一", "二", "三", "四", "五", "六", "日"].map((label, index) => {
    const value = String(index + 1);
    return `<label>${label}<input type="checkbox" name="weekday" value="${value}" ${selected.has(value) ? "checked" : ""}></label>`;
  }).join("");
  const people = (state.data.personnel || []).map((person) => `<option value="${person.id}" ${person.id === row.personnel_id ? "selected" : ""}>${esc(person.name)}</option>`).join("");
  openSheet(item ? "编辑作息班次" : "添加作息班次", `
    <form novalidate data-form="schedule" data-id="${item ? item.id : ""}">
      <label class="field">
        <span>班次名称</span>
        <input name="name" required maxlength="40" value="${esc(row.name)}" placeholder="例如 默认早九晚六">
      </label>
      <label class="field">
        <span>适用对象</span>
        <select name="personnel_id"><option value="">全员通用</option>${people}</select>
      </label>
      <div class="grid-2">
        <label class="field"><span>上班时间</span><input name="clock_in" type="time" required value="${esc(row.clock_in)}"></label>
        <label class="field"><span>下班时间</span><input name="clock_out" type="time" required value="${esc(row.clock_out)}"></label>
      </div>
      <p class="hint" style="margin:-6px 0 14px">下班时间需晚于当天上班时间（暂不支持跨零点班次）。</p>
      <fieldset class="field"><legend>工作日</legend><div class="days">${days}</div></fieldset>
      <label class="field"><span>时区</span><input name="timezone" value="${esc(row.timezone || "Asia/Shanghai")}"></label>
      <div class="choice">
        <label><input type="checkbox" name="skip_holidays" ${row.skip_holidays ? "checked" : ""}> 法定放假日自动跳过，调休补班日照常提醒</label>
        <label><input type="checkbox" name="is_default" ${row.is_default ? "checked" : ""} ${row.personnel_id ? "disabled" : ""}> 设为全员默认班次</label>
        <label><input type="checkbox" name="enabled" ${row.enabled ? "checked" : ""}> 启用该班次</label>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn quiet" data-action="close-sheet">取消</button>
        <button class="btn primary" type="submit">保存班次</button>
      </div>
    </form>`);
}

function holidayForm() {
  openSheet("添加放假或调休补班", `
    <form novalidate data-form="holiday">
      <label class="field"><span>日期</span><input name="day" type="date" required></label>
      <label class="field"><span>名称</span><input name="name" required maxlength="40" placeholder="例如 国庆节 / 春节调休"></label>
      <div class="choice">
        <label><input type="radio" name="is_workday" value="0" checked> 放假休息（当天暂停提醒）</label>
        <label><input type="radio" name="is_workday" value="1"> 调休补班（当天按班次正常提醒）</label>
      </div>
      <div class="sheet-actions">
        <button type="button" class="btn quiet" data-action="close-sheet">取消</button>
        <button class="btn primary" type="submit">保存日期</button>
      </div>
    </form>`);
}

function ruleForm(rule) {
  const row = rule || {
    name: "",
    kind: "clock_in",
    schedule_id: null,
    target_mode: "all",
    target_ids: [],
    offset_minutes: -15,
    repeat_every_minutes: 0,
    repeat_max: 1,
    grace_minutes: 20,
    require_not_checked: true,
    template: "{name}，{clock_time} {kind}时间快到了（现在 {time}），记得打卡。",
    enabled: true,
  };
  const selected = new Set(row.target_ids || []);
  const people = (state.data.personnel || []).map(
    (person) => `<label><input type="checkbox" name="target_id" value="${person.id}" ${selected.has(person.id) ? "checked" : ""}> ${esc(person.name)} <span class="mono">(${esc(person.userid)})</span></label>`
  ).join("");
  const schedules = (state.data.schedules || []).map(
    (item) => `<option value="${item.id}" ${item.id === row.schedule_id ? "selected" : ""}>${esc(item.name)} (${esc(item.clock_in)}–${esc(item.clock_out)})</option>`
  ).join("");
  const repeating = row.repeat_every_minutes > 0;

  openSheet(rule ? "编辑提醒规则" : "新增提醒规则", `
    <form novalidate data-form="rule" data-id="${rule ? rule.id : ""}">
      <label class="field">
        <span>规则名称</span>
        <input name="name" required maxlength="40" value="${esc(row.name)}" placeholder="例如 上班前提醒">
      </label>
      <div class="grid-2">
        <label class="field">
          <span>提醒类型</span>
          <select name="kind">
            <option value="clock_in" ${row.kind === "clock_in" ? "selected" : ""}>上班提醒</option>
            <option value="clock_out" ${row.kind === "clock_out" ? "selected" : ""}>下班提醒</option>
          </select>
        </label>
        <label class="field">
          <span>偏移分钟数</span>
          <input name="offset_minutes" type="number" required value="${row.offset_minutes}">
        </label>
      </div>
      <p class="hint" style="margin:-8px 0 14px">负数代表提前，0 代表准点，正数代表延后。例如 <code class="mono">-15</code> 表示提前 15 分钟。</p>

      <fieldset class="field">
        <legend>接收人员范围</legend>
        <div class="choice" style="margin-bottom:4px">
          <label><input type="radio" name="target_mode" value="all" ${row.target_mode !== "selected" ? "checked" : ""}> 全部启用人员</label>
          <label><input type="radio" name="target_mode" value="selected" ${row.target_mode === "selected" ? "checked" : ""}> 仅指定人员</label>
        </div>
        <div class="checks" data-targets ${row.target_mode === "selected" ? "" : "hidden"}>${people || `<p class="hint" style="padding:8px">还没有可选人员，请先到「人员」页添加。</p>`}</div>
      </fieldset>

      <label class="field">
        <span>绑定班次</span>
        <select name="schedule_id"><option value="">跟随各人当天生效班次</option>${schedules}</select>
      </label>

      <div class="choice">
        <label><input type="checkbox" name="require_not_checked" ${row.require_not_checked ? "checked" : ""}> 查到企业微信已打卡记录则自动跳过</label>
        <label><input type="checkbox" name="repeat_on" ${repeating ? "checked" : ""}> 未打卡时重复催办</label>
      </div>

      <div class="grid-2" data-repeat-fields ${repeating ? "" : "hidden"}>
        <label class="field"><span>重复间隔（分钟）</span><input name="repeat_every_minutes" type="number" min="1" max="240" value="${row.repeat_every_minutes || 15}"></label>
        <label class="field"><span>最多发送次数</span><input name="repeat_max" type="number" min="1" max="12" value="${row.repeat_max || 3}"></label>
      </div>

      <label class="field">
        <span>启动补发窗口（分钟）</span>
        <input name="grace_minutes" type="number" min="1" max="180" required value="${row.grace_minutes}">
      </label>

      <label class="field">
        <span>消息模板</span>
        <textarea name="template" required maxlength="800">${esc(row.template)}</textarea>
        <span class="hint">支持变量：<code class="mono">{name}</code> <code class="mono">{userid}</code> <code class="mono">{kind}</code> <code class="mono">{time}</code> <code class="mono">{clock_time}</code> <code class="mono">{date}</code></span>
        <div class="preview" data-preview>${esc(sampleMessage(row, state.data.schedule))}</div>
      </label>

      <div class="choice">
        <label><input type="checkbox" name="enabled" ${row.enabled ? "checked" : ""}> 立即启用这条规则</label>
      </div>

      <div class="sheet-actions">
        <button type="button" class="btn quiet" data-action="close-sheet">取消</button>
        <button class="btn primary" type="submit">保存规则</button>
      </div>
    </form>`);
}

/* ---------------- 数据加载与事件交互 ---------------- */

function normalizeRoute(rawHash) {
  const clean = (rawHash || "#/today").replace("#/", "");
  if (clean === "rules") return "today";
  return ROUTES.includes(clean) ? clean : "today";
}

async function load() {
  state.route = normalizeRoute(location.hash);
  const authed = Boolean(token());
  if (!authed && state.route !== "login") {
    location.hash = "#/login";
    return;
  }
  if (authed && state.route === "login") {
    location.hash = "#/today";
    return;
  }
  document.body.classList.toggle("is-login", state.route === "login");
  document.querySelectorAll(".nav-item").forEach((link) => {
    if (link.dataset.route === state.route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = state.route === "login" ? "登录 · qyekq" : `${META[state.route][0]} · qyekq`;

  const view = document.getElementById("view");
  if (state.route === "login") {
    view.innerHTML = renderLogin();
    return;
  }
  try {
    if (state.route === "today") {
      const [dash, rules] = await Promise.all([api("/dashboard"), api("/rules")]);
      state.data = {
        ...dash,
        rules: rules.items,
        personnel: rules.personnel,
        schedules: rules.schedules,
      };
    } else if (state.route === "people") {
      state.data = await api("/personnel");
    } else if (state.route === "schedules") {
      const [schedules, people] = await Promise.all([api("/schedules"), api("/personnel")]);
      state.data = { ...schedules, personnel: people.items };
    } else if (state.route === "logs") {
      const query = state.logStatus ? `?status=${state.logStatus}&limit=150` : "?limit=150";
      state.data = await api("/logs" + query);
    } else {
      const [settings, people] = await Promise.all([api("/settings/wecom"), api("/personnel")]);
      state.data = { ...settings, personnel: people.items };
    }
    view.innerHTML = render();
    syncSideIndicators();
  } catch (err) {
    view.innerHTML = `<article class="card">${EmptyState({
      icon: "plug",
      title: "数据加载失败",
      description: err.message || "无法连接本地后端接口，请确认 run.py 服务正在运行。",
    })}</article>`;
  }
}

function findById(list, id) {
  return (list || []).find((item) => String(item.id) === String(id));
}

async function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  try {
    if (action === "fill-demo") {
      const form = document.querySelector("[data-form=login]");
      if (!form) return;
      form.username.value = "qyekq";
      form.password.value = "qyekq";
      form.password.focus();
      return;
    }
    if (action === "logout") {
      clearToken();
      location.hash = "#/login";
      return;
    }
    if (action === "close-sheet") closeSheet();
    else if (action === "new-person") personForm(null);
    else if (action === "edit-person") personForm(findById(state.data.items, id));
    else if (action === "delete-person") await removeRow("personnel", id, target.dataset.name, "人员", "删除后该成员将不再收到任何上下班提醒。");
    else if (action === "new-schedule") scheduleForm(null);
    else if (action === "edit-schedule") scheduleForm(findById(state.data.items, id));
    else if (action === "delete-schedule") await removeRow("schedules", id, target.dataset.name, "班次", "关联它的成员将回退到全员默认班次。");
    else if (action === "new-holiday") holidayForm();
    else if (action === "delete-holiday") await removeRow("holidays", id, target.dataset.name, "特殊日期", "");
    else if (action === "new-rule") ruleForm(null);
    else if (action === "edit-rule") ruleForm(findById(state.data.rules, id) || findById(state.data.items, id));
    else if (action === "delete-rule") await removeRow("rules", id, target.dataset.name, "提醒规则", "删除后对应时点将不再向成员发送提醒。");
    else if (action === "toggle") await toggleItem(target);
    else if (action === "sync-people") await syncPeople(target);
    else if (action === "run-tick") await runTick(target);
    else if (action === "toggle-scheduler") await toggleScheduler(target);
    else if (action === "test-wecom") await testWecom(target);
    else if (action === "new-test") location.hash = "#/connect";
    else if (action === "filter-logs") {
      state.logStatus = target.dataset.status || "";
      await load();
    }
  } catch (err) {
    toast(err.message || "操作未能完成");
  }
}

async function removeRow(path, id, name, label, detail) {
  const promptText = detail ? `确认删除${label}「${name}」？\n${detail}` : `确认删除${label}「${name}」？`;
  if (!confirm(promptText)) return;
  await api(`/${path}/${id}`, { method: "DELETE" });
  toast(`已删除「${name}」`);
  await load();
}

async function toggleItem(button) {
  const kind = button.dataset.kind;
  const path = { person: "personnel", schedule: "schedules", rule: "rules" }[kind];
  const enabled = button.dataset.enabled === "1";
  button.disabled = true;
  try {
    await api(`/${path}/${button.dataset.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !enabled }),
    });
    toast(!enabled ? "已启用" : "已停用");
    await load();
  } finally {
    button.disabled = false;
  }
}

async function syncPeople(button) {
  button.disabled = true;
  try {
    const result = await api("/personnel/sync", { method: "POST" });
    toast(result.message || "通讯录同步完成");
    await load();
  } finally {
    button.disabled = false;
  }
}

async function runTick(button) {
  if (state.data?.wecom?.configured && !confirm("立即执行一轮提醒检查？若当前正处于规则触发窗口内，会向未打卡成员发送真实企业微信消息。")) {
    return;
  }
  button.disabled = true;
  try {
    const result = await api("/scheduler/tick", { method: "POST" });
    toast(result.reason || `检查完成：发送 ${result.sent}，跳过 ${result.skipped}，失败 ${result.failed}`);
    await load();
  } finally {
    button.disabled = false;
  }
}

async function toggleScheduler(button) {
  button.disabled = true;
  try {
    const enabled = !state.data.scheduler_enabled;
    await api("/settings/scheduler", { method: "PUT", body: JSON.stringify({ enabled }) });
    toast(enabled ? "自动提醒已开启" : "自动提醒已暂停");
    await load();
  } finally {
    button.disabled = false;
  }
}

async function testWecom(button) {
  button.disabled = true;
  try {
    const result = await api("/settings/wecom/test", { method: "POST" });
    toast(result.message || "企业微信应用连接正常");
    await load();
  } finally {
    button.disabled = false;
  }
}

function fieldMessage(input) {
  if (input.name === "username") return "请输入账号";
  if (input.name === "password") return "请输入密码";
  const label = input.closest(".field")?.querySelector(":scope > span, legend");
  const text = label?.textContent?.replace(/\s+/g, " ").trim();
  return text ? `请填写${text}` : "请填写此字段";
}

function clearFieldError(input) {
  const field = input.closest(".field");
  if (!field?.classList.contains("invalid")) return;
  if (String(input.value || "").trim()) {
    field.classList.remove("invalid");
    field.querySelector(".field-error")?.remove();
  }
}

function validateForm(form) {
  form.querySelectorAll(".field.invalid").forEach((field) => {
    field.classList.remove("invalid");
    field.querySelector(".field-error")?.remove();
  });
  const missing = [...form.querySelectorAll("input, select, textarea")].filter((el) => {
    if (!el.required || el.disabled || el.type === "checkbox" || el.type === "radio") return false;
    return !String(el.value || "").trim();
  });
  missing.forEach((input) => {
    const field = input.closest(".field");
    if (!field) return;
    field.classList.add("invalid");
    const note = document.createElement("p");
    note.className = "field-error";
    note.textContent = fieldMessage(input);
    field.appendChild(note);
  });
  if (missing[0]) missing[0].focus();
  return missing.length === 0;
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  event.preventDefault();
  if (!validateForm(form)) return;
  const submit = form.querySelector("[type=submit]");
  if (submit) submit.disabled = true;
  try {
    const kind = form.dataset.form;
    if (kind === "login") {
      await submitLogin(form);
      return;
    }
    if (kind === "person") await savePerson(form);
    else if (kind === "schedule") await saveSchedule(form);
    else if (kind === "holiday") await saveHoliday(form);
    else if (kind === "rule") await saveRule(form);
    else if (kind === "wecom") await saveWecom(form);
    else if (kind === "test") await saveTest(form);
    closeSheet();
    await load();
  } catch (err) {
    toast(err.message || "保存失败");
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function submitLogin(form) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: form.username.value.trim(),
      password: form.password.value,
      remember: form.remember.checked,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "账号或密码不对");
  storeToken(data.token, form.remember.checked, data.username || form.username.value.trim());
  location.hash = "#/today";
}

async function savePerson(form) {
  const body = {
    userid: form.userid.value.trim(),
    name: form.name.value.trim(),
    department: form.department.value.trim(),
    mobile: form.mobile.value.trim(),
    enabled: form.enabled.checked,
  };
  const id = form.dataset.id;
  await api(id ? `/personnel/${id}` : "/personnel", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
  toast("人员已保存");
}

async function saveSchedule(form) {
  const days = [...form.querySelectorAll("input[name=weekday]:checked")].map((node) => node.value).sort();
  if (!days.length) throw new Error("请至少选择一个工作日");
  const body = {
    name: form.name.value.trim(),
    personnel_id: form.personnel_id.value ? Number(form.personnel_id.value) : null,
    clock_in: form.clock_in.value,
    clock_out: form.clock_out.value,
    weekdays: days.join(","),
    timezone: form.timezone.value.trim() || "Asia/Shanghai",
    skip_holidays: form.skip_holidays.checked,
    is_default: form.is_default.checked && !form.personnel_id.value,
    enabled: form.enabled.checked,
  };
  const id = form.dataset.id;
  await api(id ? `/schedules/${id}` : "/schedules", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
  toast("班次已保存");
}

async function saveHoliday(form) {
  await api("/holidays", {
    method: "POST",
    body: JSON.stringify({
      day: form.day.value,
      name: form.name.value.trim(),
      is_workday: form.is_workday.value === "1",
    }),
  });
  toast("特殊日期已保存");
}

async function saveRule(form) {
  const mode = form.target_mode.value;
  const targetIds = [...form.querySelectorAll("input[name=target_id]:checked")].map((node) => Number(node.value));
  if (mode === "selected" && !targetIds.length) throw new Error("指定人员时请至少勾选一位成员");
  const repeating = form.repeat_on.checked;
  const body = {
    name: form.name.value.trim(),
    kind: form.kind.value,
    schedule_id: form.schedule_id.value ? Number(form.schedule_id.value) : null,
    target_mode: mode,
    target_ids: mode === "selected" ? targetIds : [],
    offset_minutes: Number(form.offset_minutes.value),
    repeat_every_minutes: repeating ? Number(form.repeat_every_minutes.value) : 0,
    repeat_max: repeating ? Number(form.repeat_max.value) : 1,
    grace_minutes: Number(form.grace_minutes.value),
    require_not_checked: form.require_not_checked.checked,
    template: form.template.value.trim(),
    enabled: form.enabled.checked,
  };
  const id = form.dataset.id;
  await api(id ? `/rules/${id}` : "/rules", { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
  toast("提醒规则已保存");
}

async function saveWecom(form) {
  await api("/settings/wecom", {
    method: "PUT",
    body: JSON.stringify({
      corp_id: form.corp_id.value.trim(),
      agent_id: form.agent_id.value.trim(),
      secret: form.secret.value.trim(),
      sync_department_id: form.sync_department_id.value.trim() || "1",
    }),
  });
  toast("企业微信配置已保存");
}

async function saveTest(form) {
  await api("/messages/test", {
    method: "POST",
    body: JSON.stringify({
      personnel_id: Number(form.personnel_id.value),
      content: form.content.value.trim(),
    }),
  });
  toast("测试消息已发送");
}

function updateRulePreview(form) {
  const preview = form?.querySelector("[data-preview]");
  if (!preview) return;
  preview.textContent = sampleMessage(
    {
      template: form.template?.value || "",
      kind: form.kind?.value || "clock_in",
      offset_minutes: Number(form.offset_minutes?.value || 0),
    },
    state.data?.schedule
  );
}

function onChange(event) {
  const target = event.target;
  if (target.name === "repeat_on") {
    const box = document.querySelector("[data-repeat-fields]");
    if (box) box.hidden = !target.checked;
  }
  if (target.name === "target_mode") {
    const box = document.querySelector("[data-targets]");
    if (box) box.hidden = target.value !== "selected";
  }
  if ((target.name === "kind" || target.name === "offset_minutes") && target.form?.dataset.form === "rule") {
    updateRulePreview(target.form);
  }
  if (target.name === "personnel_id" && target.form?.dataset.form === "schedule") {
    const box = target.form.querySelector("input[name=is_default]");
    if (!box) return;
    if (target.value) {
      box.checked = false;
      box.disabled = true;
    } else {
      box.disabled = false;
    }
  }
}

function onInput(event) {
  if (event.target.closest(".field")) clearFieldError(event.target);
  if (event.target.id === "people-q") {
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll("[data-person-row]").forEach((row) => {
      const match = !query || row.dataset.q.includes(query);
      row.hidden = !match;
      if (match) visible += 1;
    });
    const emptyHint = document.querySelector("[data-people-empty]");
    if (emptyHint) emptyHint.hidden = visible > 0;
    return;
  }
  if ((event.target.name === "template" || event.target.name === "offset_minutes") && event.target.form?.dataset.form === "rule") {
    updateRulePreview(event.target.form);
  }
}

function setSideDots(schedOn) {
  const schedText = document.querySelector("[data-sched]");
  const schedDot = document.querySelector("[data-side-sched-dot]");
  if (schedText) schedText.textContent = schedOn ? "运行中" : "已暂停";
  if (schedDot) schedDot.className = schedOn ? "pulse" : "pulse off";
}

function syncSideIndicators() {
  if (!state.data) return;
  if ("scheduler_enabled" in state.data) setSideDots(Boolean(state.data.scheduler_enabled));
}

async function health() {
  if (!token()) return;
  try {
    const data = await api("/health");
    setSideDots(Boolean(data.scheduler_enabled));
  } catch {
    /* 保持上一次侧栏状态 */
  }
}

function boot() {
  document.addEventListener("click", onClick);
  document.addEventListener("submit", onSubmit);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSheet();
    trapSheetFocus(event);
  });
  window.addEventListener("hashchange", () => {
    closeSheet();
    load();
  });
  if (!location.hash) location.hash = "#/today";
  else load();
  health();
  paintUser();
  setInterval(health, 20000);
  setInterval(() => {
    if (state.route === "today" && !document.body.classList.contains("sheet-open")) load();
  }, 30000);
}

boot();
})();
