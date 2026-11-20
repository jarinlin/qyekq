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
  InfoTip,
  PageHeader,
  EmptyState,
  RuleCard,
  ScheduleCard,
  askConfirm,
} = window.BandianUI;

const ROUTES = ["today", "people", "schedules", "logs", "connect", "login"];
const META = {
  today: ["提醒管理", "设置上下班提醒时点、接收成员与重复催办策略，到点通过企业微信自建应用自动发送。"],
  people: ["接收人员", "从每天缓存的企业微信成员里挑选。想立刻更新名单时，再点同步。"],
  schedules: ["作息班次", "配置默认上下班时间、适用工作日以及节假日放假与调休补班。"],
  logs: ["发送记录", "核对提醒消息是否已发出、因已打卡跳过或发送失败。"],
  connect: ["应用连接", "配置企业微信自建应用凭证，并向指定成员发送测试消息验证连通性。"],
};

const state = {
  route: "today",
  data: null,
  user: "",
  authed: false,
  logStatus: "",
  logPage: 1,
  logPageSize: 20,
  lastFocus: null,
};

const LOG_STATUS = {
  waiting: ["未到点", ""],
  due: ["待发送", "accent"],
  sent: ["已发送", "ok"],
  skipped: ["已跳过", "warn"],
  failed: ["发送失败", "err"],
  missed: ["已错过", ""],
};

function paintUser() {
  const name = state.user || "";
  document.querySelectorAll("[data-user-name]").forEach((node) => {
    node.textContent = name;
  });
  document.querySelectorAll("[data-user]").forEach((node) => {
    node.textContent = name.slice(0, 1) || "";
  });
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saltedPassword(username, password) {
  const res = await fetch(`/api/auth/salt?username=${encodeURIComponent(username)}`, { credentials: "same-origin" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "暂时不能登录");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(data.salt), iterations: data.iterations, hash: "SHA-256" },
    key,
    256,
  );
  const digest = bytesToHex(new Uint8Array(bits));
  const mac = await crypto.subtle.importKey("raw", new TextEncoder().encode(data.nonce), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", mac, new TextEncoder().encode(digest));
  return { password: bytesToHex(new Uint8Array(signed)), nonce: data.nonce };
}

async function refreshSession() {
  const res = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!res.ok) {
    state.authed = false;
    state.user = "";
    paintUser();
    return false;
  }
  const data = await res.json();
  state.authed = true;
  state.user = data.username || "";
  paintUser();
  return true;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const res = await fetch("/api" + path, { ...options, headers, credentials: "same-origin" });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (res.status === 401) {
    state.authed = false;
    state.user = "";
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

function departmentGroup(person) {
  const parts = String(person.department || "").split(" / ").map((part) => part.trim()).filter(Boolean);
  return { name: parts[0] || "未分组", extra: parts.slice(1).join(" / ") };
}

function renderPeople() {
  const items = state.data.items || [];
  const enabledCount = items.filter((p) => p.enabled).length;
  const people = [...items].sort((a, b) => {
    const left = departmentGroup(a).name;
    const right = departmentGroup(b).name;
    if (left === "未分组" && right !== "未分组") return 1;
    if (right === "未分组" && left !== "未分组") return -1;
    const byDept = left.localeCompare(right, "zh");
    if (byDept) return byDept;
    return String(a.name).localeCompare(String(b.name), "zh");
  });
  const rows = people.map((person) => {
    const group = departmentGroup(person);
    const tags = group.name === "未分组"
      ? `<span class="tag tag-muted">未分组</span>`
      : `<span class="tag">${esc(group.name)}</span>${group.extra ? `<span class="tag tag-muted">兼 ${esc(group.extra)}</span>` : ""}`;
    return `<tr data-person-row data-q="${esc(`${person.name} ${person.userid} ${person.department}`.toLowerCase())}">
    <td><div class="who"><b>${esc(person.name)}</b></div></td>
    <td><div class="dept-tags">${tags}</div></td>
    <td>${Switch({
      kind: "person",
      id: person.id,
      enabled: person.enabled,
      label: `${person.enabled ? "停用" : "启用"} ${person.name}`,
    })}</td>
    <td class="row-actions-cell"><div class="row-actions">
      <button type="button" class="btn ghost sm" data-action="edit-person" data-id="${person.id}" aria-label="编辑 ${esc(person.name)}">${ICONS.edit}<span>编辑</span></button>
      <button type="button" class="btn ghost danger-hover sm" data-action="delete-person" data-id="${person.id}" data-name="${esc(person.name)}" aria-label="删除 ${esc(person.name)}">${ICONS.trash}<span>删除</span></button>
    </div></td>
  </tr>`;
  }).join("");

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
        ? `<div class="table-wrap"><table class="people-table">
            <thead><tr><th>成员</th><th>部门</th><th>接收提醒</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          <p class="hint" data-people-empty hidden style="padding:18px 24px">没有匹配的成员。</p>`
        : EmptyState({
            icon: "users",
            title: "还没有接收人员",
            description: "先同步或等到每天的自动同步，再从缓存名单里选择要提醒的人。",
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
          <h2 class="section-title">节假日与调休补班 ${InfoTip("标记为「放假」的日期不会发送提醒；周末如需上班，标记为「补班」即可按工作日规则正常提醒。")}</h2>
        </div>
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
  const total = Number(state.data.total || 0);
  const page = Number(state.data.page || 1);
  const pages = Number(state.data.pages || 1);
  const pageSize = Number(state.data.page_size || state.logPageSize);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = total ? Math.min(page * pageSize, total) : 0;
  const sizeOptions = [20, 50, 100].map((size) => `<option value="${size}" ${size === pageSize ? "selected" : ""}>${size} 条/页</option>`).join("");
  const pager = `<div class="pager">
    <label class="pager-size">每页
      <select data-action="log-page-size" aria-label="每页条数">${sizeOptions}</select>
    </label>
    <span class="pager-meta">${total ? `${from}–${to} / ${total}` : "共 0 条"}</span>
    <div class="pager-nav">
      <button type="button" class="btn quiet sm" data-action="log-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <span>${page} / ${pages}</span>
      <button type="button" class="btn quiet sm" data-action="log-page" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>下一页</button>
    </div>
  </div>`;

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
          </table></div>
          ${pager}`
        : EmptyState({
            icon: "logs",
            title: state.logStatus ? "当前筛选下没有记录" : "还没有发送记录",
            description: state.logStatus ? "切换到「全部记录」查看其他状态的发送流水。" : "提醒规则到点触发或手动发送测试消息后，流水会显示在这里。",
          })}
    </article>`;
}

function syncTimeRows(times) {
  const list = Array.isArray(times) && times.length ? times : ["06:30"];
  return list.map((time) => `<div class="sync-time-row">
    <input name="leave_sync_time" type="time" value="${esc(time)}" required>
    <button type="button" class="btn quiet sm" data-action="remove-sync-time">去掉</button>
  </div>`).join("");
}

function leaveSyncNote(data) {
  const raw = String(data.leave_sync_at || "");
  if (!/^\d+$/.test(raw)) return "还没有成功拉取过。";
  const text = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(Number(raw) * 1000));
  return `上次成功拉取：${text}。`;
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
          <h2 class="section-title">企业微信自建应用凭证 ${InfoTip("自建应用需开启「发送应用消息」权限；跳过已打卡需「打卡」权限；同步成员需「通讯录读取」权限，并把本机出口 IP 加入可信 IP。同步会拉取这个应用可见范围内的全部人员。")}</h2>
          ${wecomPill}
        </div>
        <form novalidate data-form="wecom" autocomplete="off" style="margin-top:20px">
          <label class="field">
            <span>企业 ID (CorpID)</span>
            <input name="corp_id" value="${esc(data.corp_id)}" placeholder="例如 ww1234567890abcdef" required autocomplete="off">
          </label>
          <label class="field">
            <span>应用 AgentId</span>
            <input name="agent_id" value="${esc(data.agent_id)}" placeholder="例如 1000002" inputmode="numeric" required autocomplete="off">
          </label>
          <label class="field">
            <span>应用 Secret ${InfoTip("Secret 仅保存在本机 SQLite 数据库中，接口不回传明文。")}</span>
            <input name="secret" type="password" autocomplete="new-password" placeholder="${data.secret_set ? "已安全保存，留空表示不修改" : "粘贴自建应用 Secret"}">
          </label>
          <fieldset class="field">
            <span>审批同步时间 ${InfoTip("按上海时间。加几个时刻就到点拉几次。请假、出差、外出都是同一类假勤审批，不用填模板 ID。每次从上次成功时间接着拉，重叠 2 分钟。换上这次更新后的第一次同步，会再补近 28 天。")}</span>
            <div class="sync-time-list" data-sync-time-list>${syncTimeRows(data.leave_sync_times)}</div>
            <div class="sync-time-actions">
              <button type="button" class="btn quiet sm" data-action="add-sync-time">再加一个时间</button>
              <button type="button" class="btn quiet sm" data-action="sync-approvals">${ICONS.sync}<span>立刻同步</span></button>
            </div>
          </fieldset>
          <p class="hint">${esc(leaveSyncNote(data))}${data.secret_set ? ` 当前已保存 Secret（末四位 ${esc(data.secret_hint)}）。` : ""}${data.last_test_message ? ` ${esc(data.last_test_message)}` : ""}</p>
          <div class="sheet-actions" style="border-top:0;padding-top:4px;margin-top:14px">
            <button class="btn primary" type="submit">保存应用配置</button>
          </div>
        </form>
      </article>

      <article class="card">
        <div class="section-head">
          <h2 class="section-title">发送测试消息 ${InfoTip("保存凭证并添加至少一位人员后，可向自己发送一条真实企业微信应用消息确认链路畅通。")}</h2>
        </div>
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

function addSyncTime(button) {
  const list = button.closest("form")?.querySelector("[data-sync-time-list]");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "sync-time-row";
  row.innerHTML = `<input name="leave_sync_time" type="time" required>
    <button type="button" class="btn quiet sm" data-action="remove-sync-time">去掉</button>`;
  list.appendChild(row);
  row.querySelector("input")?.focus();
}

function removeSyncTime(button) {
  const list = button.closest("[data-sync-time-list]");
  const row = button.closest(".sync-time-row");
  if (!list || !row || list.children.length <= 1) return;
  row.remove();
}

function toggleDirectory(button) {
  const group = button.closest("[data-directory-group]");
  const panel = group?.querySelector(".directory-people");
  if (!panel) return;
  const open = panel.hidden;
  panel.hidden = !open;
  button.setAttribute("aria-expanded", open ? "true" : "false");
}

function syncDirectoryGroup(group) {
  const all = group.querySelector("[data-directory-all]");
  if (!all) return;
  const boxes = [...group.querySelectorAll("input[name=userid]")].filter((box) => !box.closest("[data-directory-person]")?.hidden);
  const checked = boxes.filter((box) => box.checked).length;
  all.checked = boxes.length > 0 && checked === boxes.length;
  all.indeterminate = checked > 0 && checked < boxes.length;
}

function directoryChoices() {
  const taken = new Set((state.data.items || []).map((person) => person.userid));
  return (state.data.directory || []).filter((person) => person.userid && !taken.has(person.userid));
}

function directoryList() {
  const choices = directoryChoices();
  if (!(state.data.directory || []).length) {
    return `<p class="hint">还没有成员缓存。先点「同步企业微信成员」，或等到每天的自动同步。</p>`;
  }
  if (!choices.length) return `<p class="hint">缓存里的人都已经添加了。</p>`;
  const groups = new Map();
  choices.forEach((person) => {
    const group = departmentGroup(person);
    if (!groups.has(group.name)) groups.set(group.name, []);
    groups.get(group.name).push({ person, extra: group.extra });
  });
  const ordered = [...groups.entries()].sort((a, b) => {
    if (a[0] === "未分组") return 1;
    if (b[0] === "未分组") return -1;
    return a[0].localeCompare(b[0], "zh");
  });
  const blocks = ordered.map(([name, members]) => {
    const people = members.map(({ person, extra }) => `<label data-directory-person data-q="${esc(`${person.name} ${person.department}`.toLowerCase())}">
      <input type="checkbox" name="userid" value="${esc(person.userid)}">
      <span>${esc(person.name)}${extra ? `<span class="mono"> 兼 ${esc(extra)}</span>` : ""}</span>
    </label>`).join("");
    return `<div data-directory-group data-dept="${esc(name)}">
      <div class="directory-head">
        <label class="directory-check"><input type="checkbox" data-directory-all aria-label="选中${esc(name)}全部成员"></label>
        <button type="button" class="directory-toggle" data-action="toggle-directory" aria-expanded="false">
          <span>${esc(name)}</span>
          <span class="directory-count">${members.length}</span>
          <span class="chevron" aria-hidden="true"></span>
        </button>
      </div>
      <div class="directory-people" hidden>${people}</div>
    </div>`;
  }).join("");
  return `<label class="field"><span>搜索</span><input id="directory-q" type="search" placeholder="按姓名或部门筛选" autocomplete="off"></label>
    <p class="hint">默认只显示部门。勾选部门会选中该部门全部成员，点部门名称展开名单。</p>
    <div class="directory-list">${blocks}</div>`;
}

function personForm(person) {
  if (!person) {
    const choices = directoryChoices();
    openSheet("添加接收人员", `
      <form novalidate data-form="person" autocomplete="off">
        ${directoryList()}
        <div class="sheet-actions">
          <button type="button" class="btn quiet" data-action="close-sheet">取消</button>
          <button class="btn primary" type="submit" ${choices.length ? "" : "disabled"}>添加所选</button>
        </div>
      </form>`);
    return;
  }
  openSheet("编辑接收人员", `
    <form novalidate data-form="person" data-id="${person.id}" autocomplete="off">
      <input type="hidden" name="userid" value="${esc(person.userid)}">
      <input type="hidden" name="person_name" value="${esc(person.name)}">
      <input type="hidden" name="department" value="${esc(person.department || "")}">
      <p class="who"><b>${esc(person.name)}</b><span>${esc(person.department || "未分组")}</span></p>
      <label class="field">
        <span>手机号（选填）</span>
        <input name="mobile" maxlength="32" value="${esc(person.mobile || "")}" autocomplete="tel" inputmode="tel">
      </label>
      <div class="choice">
        <label><input type="checkbox" name="enabled" ${person.enabled ? "checked" : ""}> 启用该成员的上下班提醒</label>
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
        <label class="field"><span>下班时间 ${InfoTip("下班时间需晚于当天上班时间，暂不支持跨零点班次。")}</span><input name="clock_out" type="time" required value="${esc(row.clock_out)}"></label>
      </div>
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
    template: "{name}，{clock_time} 的{kind}打卡快到了。现在是 {time}，打一下，免得待会忘记。",
    enabled: true,
  };
  const selected = new Set(row.target_ids || []);
  const people = (state.data.personnel || []).map(
    (person) => `<label><input type="checkbox" name="target_id" value="${person.id}" ${selected.has(person.id) ? "checked" : ""}> ${esc(person.name)} <span class="mono">(${esc(person.userid)})</span></label>`
  ).join("");
  const schedules = (state.data.schedules || []).map(
    (item) => `<option value="${item.id}" ${item.id === row.schedule_id ? "selected" : ""}>${esc(item.name)} (${esc(item.clock_in)}–${esc(item.clock_out)})</option>`
  ).join("");
  const again = row.repeat_max > 1;

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
          <span>偏移分钟数 ${InfoTip("负数代表提前，0 代表准点，正数代表延后。例如 -15 表示提前 15 分钟。")}</span>
          <input name="offset_minutes" type="number" required value="${row.offset_minutes}">
        </label>
      </div>

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
        <label><input type="checkbox" name="repeat_on" ${again ? "checked" : ""}> 还没打卡时，15 分钟后再提醒一次</label>
      </div>

      <label class="field">
        <span>消息模板 ${InfoTip("支持变量：{name} {userid} {kind} {time} {clock_time} {date}")}</span>
        <textarea name="template" required maxlength="800">${esc(row.template)}</textarea>
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
  const authed = await refreshSession();
  if (!authed && state.route !== "login") {
    location.hash = "#/login";
    return;
  }
  if (authed && state.route === "login") {
    location.hash = "#/today";
    return;
  }
  document.querySelectorAll(".nav-item").forEach((link) => {
    if (link.dataset.route === state.route) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.title = state.route === "login" ? "登录 · qyekq" : `${META[state.route][0]} · qyekq`;

  const view = document.getElementById("view");
  let markup = "";
  let syncSide = false;
  if (state.route === "login") {
    markup = renderLogin();
  } else {
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
        const params = new URLSearchParams({
          page: String(state.logPage),
          page_size: String(state.logPageSize),
        });
        if (state.logStatus) params.set("status", state.logStatus);
        state.data = await api(`/logs?${params}`);
        state.logPage = state.data.page || 1;
        state.logPageSize = state.data.page_size || state.logPageSize;
      } else {
        const [settings, people] = await Promise.all([api("/settings/wecom"), api("/personnel")]);
        state.data = { ...settings, personnel: people.items };
      }
      markup = render();
      syncSide = true;
    } catch (err) {
      markup = `<article class="card">${EmptyState({
        icon: "plug",
        title: "数据加载失败",
        description: err.message || "无法连接本地后端接口，请确认 run.py 服务正在运行。",
      })}</article>`;
    }
  }
  document.body.classList.toggle("is-login", state.route === "login");
  view.innerHTML = markup;
  if (syncSide) syncSideIndicators();
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
    if (action === "logout") {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      state.authed = false;
      state.user = "";
      location.hash = "#/login";
      if (state.route === "login") await load();
      return;
    }
    if (action === "close-sheet") closeSheet();
    else if (action === "add-sync-time") addSyncTime(target);
    else if (action === "remove-sync-time") removeSyncTime(target);
    else if (action === "toggle-directory") toggleDirectory(target);
    else if (action === "new-person") personForm(null);
    else if (action === "edit-person") personForm(findById(state.data.items, id));
    else if (action === "delete-person") await removeRow("personnel", id, target.dataset.name, {
      title: "确认删除该成员？",
      body: "删除后将无法接收后续的上下班提醒，且无法恢复。",
      confirmLabel: "确认删除",
    });
    else if (action === "new-schedule") scheduleForm(null);
    else if (action === "edit-schedule") scheduleForm(findById(state.data.items, id));
    else if (action === "delete-schedule") await removeRow("schedules", id, target.dataset.name, {
      title: "确认删除该班次？",
      body: `删除「${target.dataset.name || "该班次"}」后，正在使用它的成员会回到全员默认班次，这个班次无法恢复。`,
      confirmLabel: "确认删除",
    });
    else if (action === "new-holiday") holidayForm();
    else if (action === "delete-holiday") await removeRow("holidays", id, target.dataset.name, {
      title: "确认删除该特殊日期？",
      body: `删除「${target.dataset.name || "该日期"}」后，这一天不再按放假或调休处理，提醒会回到普通工作日规则，且无法恢复。`,
      confirmLabel: "确认删除",
    });
    else if (action === "new-rule") ruleForm(null);
    else if (action === "edit-rule") ruleForm(findById(state.data.rules, id) || findById(state.data.items, id));
    else if (action === "delete-rule") await removeRow("rules", id, target.dataset.name, {
      title: "确认删除该提醒规则？",
      body: `删除「${target.dataset.name || "该规则"}」后，这个时点不再向成员发送提醒，这条规则的文案和重复策略也会一起消失，且无法恢复。`,
      confirmLabel: "确认删除",
    });
    else if (action === "toggle") await toggleItem(target);
    else if (action === "sync-people") await syncPeople(target);
    else if (action === "sync-approvals") await syncApprovals(target);
    else if (action === "run-tick") await runTick(target);
    else if (action === "toggle-scheduler") await toggleScheduler(target);
    else if (action === "test-wecom") await testWecom(target);
    else if (action === "new-test") location.hash = "#/connect";
    else if (action === "filter-logs") {
      state.logStatus = target.dataset.status || "";
      state.logPage = 1;
      await load();
    }
    else if (action === "log-page") {
      state.logPage = Number(target.dataset.page) || 1;
      await load();
    }
  } catch (err) {
    toast(err.message || "操作未能完成");
  }
}

async function removeRow(path, id, name, copy) {
  const ok = await askConfirm(copy);
  if (!ok) return;
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

async function syncApprovals(button) {
  button.disabled = true;
  try {
    const result = await api("/approvals/sync", { method: "POST" });
    toast(result.message || result.reason || "审批已同步");
    if (result.ran) await load();
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
  if (state.data?.wecom?.configured) {
    const ok = await askConfirm({
      title: "立即执行一轮提醒检查？",
      body: "若当前正处于规则触发窗口内，会向未打卡成员发送真实企业微信消息。",
      confirmLabel: "确认检查",
    });
    if (!ok) return;
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
    const enabled = !state.schedulerOn;
    await api("/settings/scheduler", { method: "PUT", body: JSON.stringify({ enabled }) });
    setSideDots(enabled);
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
  if (String(input.value || "").trim()) field.classList.remove("invalid");
}

function validateForm(form) {
  form.querySelectorAll(".field-error").forEach((node) => node.remove());
  form.querySelectorAll(".field.invalid").forEach((field) => field.classList.remove("invalid"));
  const missing = [...form.querySelectorAll("input, select, textarea")].filter((el) => {
    if (!el.required || el.disabled || el.type === "checkbox" || el.type === "radio") return false;
    return !String(el.value || "").trim();
  });
  if (missing.length) void form.offsetWidth;
  missing.forEach((input) => {
    const field = input.closest(".field");
    if (field) field.classList.add("invalid");
  });
  if (missing[0]) {
    toast(fieldMessage(missing[0]));
    missing[0].focus();
  }
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
  const username = form.username.value.trim();
  const proof = await saltedPassword(username, form.password.value);
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      password: proof.password,
      nonce: proof.nonce,
      remember: form.remember.checked,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "账号或密码不对");
  state.authed = true;
  state.user = data.username || username;
  paintUser();
  location.hash = "#/today";
}

async function savePerson(form) {
  const id = form.dataset.id;
  if (!id) {
    const userids = [...form.querySelectorAll("input[name=userid]:checked")].map((node) => node.value);
    if (!userids.length) throw new Error("先从缓存里选择要添加的人");
    const result = await api("/personnel", { method: "POST", body: JSON.stringify({ userids }) });
    toast(`已添加 ${result.added} 人`);
    return;
  }
  await api(`/personnel/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      userid: form.userid.value,
      name: form.person_name.value,
      department: form.department.value,
      mobile: form.mobile.value.trim(),
      enabled: form.enabled.checked,
    }),
  });
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
    repeat_every_minutes: repeating ? 15 : 0,
    repeat_max: repeating ? 2 : 1,
    grace_minutes: 60,
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
      leave_sync_times: [...form.querySelectorAll("input[name=leave_sync_time]")].map((node) => node.value.trim()).filter(Boolean),
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
  if (target.matches("[data-action=log-page-size]")) {
    state.logPageSize = Number(target.value) || 20;
    state.logPage = 1;
    load();
    return;
  }
  if (target.matches("[data-directory-all]")) {
    const group = target.closest("[data-directory-group]");
    group?.querySelectorAll("input[name=userid]").forEach((box) => {
      if (!box.closest("[data-directory-person]")?.hidden) box.checked = target.checked;
    });
    if (group) syncDirectoryGroup(group);
  }
  if (target.name === "userid" && target.closest("[data-directory-group]")) {
    syncDirectoryGroup(target.closest("[data-directory-group]"));
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
  if (event.target.id === "directory-q") {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll("[data-directory-group]").forEach((group) => {
      const dept = (group.dataset.dept || "").toLowerCase();
      const deptMatch = Boolean(query) && dept.includes(query);
      const people = [...group.querySelectorAll("[data-directory-person]")];
      people.forEach((row) => {
        const personMatch = !query || row.dataset.q.includes(query);
        row.hidden = Boolean(query) && !personMatch && !deptMatch;
      });
      group.hidden = Boolean(query) && !deptMatch && people.every((row) => row.hidden);
      const panel = group.querySelector(".directory-people");
      const toggle = group.querySelector("[data-action=toggle-directory]");
      const showPeople = Boolean(query) && people.some((row) => !row.hidden && row.dataset.q.includes(query));
      if (panel && toggle) {
        panel.hidden = query ? !showPeople && !deptMatch : true;
        if (query && deptMatch) panel.hidden = false;
        if (!query) panel.hidden = true;
        toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
      }
    });
    return;
  }
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
  state.schedulerOn = Boolean(schedOn);
  const schedText = document.querySelector("[data-sched]");
  const schedDot = document.querySelector("[data-side-sched-dot]");
  const toggle = document.querySelector("[data-side-switch]");
  if (schedText) schedText.textContent = state.schedulerOn ? "运行中" : "已暂停";
  if (schedDot) schedDot.className = state.schedulerOn ? "pulse" : "pulse off";
  if (toggle) {
    toggle.setAttribute("aria-checked", state.schedulerOn ? "true" : "false");
    toggle.setAttribute("aria-label", state.schedulerOn ? "暂停自动提醒" : "开启自动提醒");
  }
}

function syncSideIndicators() {
  if (!state.data) return;
  if ("scheduler_enabled" in state.data) setSideDots(Boolean(state.data.scheduler_enabled));
}

async function health() {
  if (!state.authed) return;
  try {
    const data = await api("/health");
    setSideDots(Boolean(data.scheduler_enabled));
  } catch {
    /* 保持上一次侧栏状态 */
  }
}

function placeInfoTip(tip) {
  const bubble = tip.querySelector(".info-tip-bubble");
  if (!bubble) return;
  const margin = 12;
  bubble.style.left = "0px";
  bubble.style.right = "auto";
  const rect = bubble.getBoundingClientRect();
  let shift = 0;
  if (rect.right > window.innerWidth - margin) shift = rect.right - (window.innerWidth - margin);
  if (rect.left - shift < margin) shift = rect.left - margin;
  if (shift) bubble.style.left = `${-shift}px`;
}

function boot() {
  localStorage.removeItem("qyekq_token");
  localStorage.removeItem("qyekq_user");
  sessionStorage.removeItem("qyekq_token");
  sessionStorage.removeItem("qyekq_user");
  document.addEventListener("pointerover", (event) => {
    const tip = event.target.closest?.(".info-tip");
    if (!tip || tip.contains(event.relatedTarget)) return;
    placeInfoTip(tip);
  });
  document.addEventListener("focusin", (event) => {
    const tip = event.target.closest?.(".info-tip");
    if (tip) placeInfoTip(tip);
  });
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
