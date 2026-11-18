/* qyekq · 前端组件 (/src/assets/js/components.js) */

(() => {
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

const ICONS = {
  plus: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.25v9.5M3.25 8h9.5"/></svg>`,
  bell: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.2 6.5a3.8 3.8 0 1 1 7.6 0c0 3.2 1.45 4.25 1.45 4.25H2.75S4.2 9.7 4.2 6.5Z"/><path d="M6.6 12.75a1.55 1.55 0 0 0 2.8 0"/></svg>`,
  users: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6.2" cy="5.5" r="2.3"/><path d="M2.2 13c.45-2.1 2-3.25 4-3.25s3.55 1.15 4 3.25"/><path d="M10.8 3.6a2.1 2.1 0 0 1 0 3.8M13.8 13c-.32-1.55-1.35-2.55-2.75-2.95"/></svg>`,
  clock: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.75"/><path d="M8 4.8v3.4l2.3 1.4"/></svg>`,
  logs: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.25h10M3 8h10M3 11.75h6.5"/></svg>`,
  plug: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.3 9.7 9.7 6.3"/><path d="m8.8 4.4 1.5-1.5a2.12 2.12 0 0 1 3 3l-1.5 1.5"/><path d="m7.2 11.6-1.5 1.5a2.12 2.12 0 0 1-3-3l1.5-1.5"/></svg>`,
  edit: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.9 2.8a1.5 1.5 0 0 1 2.12 2.12L5.6 12.35 2.75 13l.65-2.85 7.5-7.35Z"/></svg>`,
  trash: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.75 4.5h10.5M6.2 4.5V3.2c0-.4.3-.7.7-.7h2.2c.4 0 .7.3.7.7v1.3M4.3 4.5l.55 8.1c.04.55.5.95 1.05.95h4.2c.55 0 1.01-.4 1.05-.95l.55-8.1"/></svg>`,
  sync: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.25 4.2v3.3h-3.3"/><path d="M2.75 11.8V8.5h3.3"/><path d="M3.5 6.1a5 5 0 0 1 8.4-1.6l1.35 1.3M12.5 9.9a5 5 0 0 1-8.4 1.6l-1.35-1.3"/></svg>`,
  play: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.25 3.6 12.2 8l-6.95 4.4V3.6Z"/></svg>`,
  search: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.2" cy="7.2" r="4.45"/><path d="m10.5 10.5 2.75 2.75"/></svg>`,
  close: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5"/></svg>`,
  calendar: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M5.5 2.25v2.2M10.5 2.25v2.2M2.5 6.75h11"/></svg>`,
  send: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 2.5 7.2 8.8"/><path d="m13.5 2.5-4.1 11-2.2-4.7-4.7-2.2 11-4.1Z"/></svg>`,
  repeat: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 2.75 13.25 4.5 11.5 6.25"/><path d="M3 7.5v-1a2 2 0 0 1 2-2h8.25"/><path d="M4.5 13.25 2.75 11.5 4.5 9.75"/><path d="M13 8.5v1a2 2 0 0 1-2 2H2.75"/></svg>`,
  shield: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.6 8.1 1.65 1.65 3.35-3.4"/><circle cx="8" cy="8" r="5.75"/></svg>`,
};

function kindLabel(kind) {
  return kind === "clock_out" ? "下班" : "上班";
}

function offsetLabel(minutes) {
  if (minutes === 0) return "准点发送";
  if (minutes < 0) return `提前 ${-minutes} 分钟`;
  return `延后 ${minutes} 分钟`;
}

function weekdayLabel(value) {
  const days = String(value || "").split(",").map(Number).filter(Boolean).sort((a, b) => a - b);
  const names = { 1: "周一", 2: "周二", 3: "周三", 4: "周四", 5: "周五", 6: "周六", 7: "周日" };
  if (days.join() === "1,2,3,4,5") return "工作日";
  if (days.join() === "1,2,3,4,5,6,7") return "每天";
  return days.map((day) => names[day]).join("、");
}

function minutesOf(hhmm) {
  const [hour, minute] = String(hhmm || "0:0").split(":").map(Number);
  return hour * 60 + minute;
}

function computeTriggerTime(clockTime, offsetMinutes) {
  if (!clockTime) return "";
  const total = minutesOf(clockTime) + Number(offsetMinutes || 0);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function sampleMessage(rule, schedule) {
  const clock = rule.kind === "clock_out"
    ? (schedule?.clock_out || "18:30")
    : (schedule?.clock_in || "09:00");
  const sendTime = computeTriggerTime(clock, rule.offset_minutes);
  const today = new Date().toISOString().slice(0, 10);
  return String(rule.template || "")
    .replaceAll("{name}", "张三")
    .replaceAll("{userid}", "zhangsan")
    .replaceAll("{kind}", kindLabel(rule.kind))
    .replaceAll("{time}", sendTime)
    .replaceAll("{clock_time}", clock)
    .replaceAll("{date}", today);
}

/**
 * 现代化 Toggle Switch 组件
 */
function Switch({ kind = "", id = "", enabled = false, label = "", action = "toggle", tone = "" }) {
  const attrs = action === "toggle"
    ? `data-action="toggle" data-kind="${esc(kind)}" data-id="${esc(id)}" data-enabled="${enabled ? "1" : "0"}"`
    : `data-action="${esc(action)}"`;
  const toneCls = tone ? ` tone-${esc(tone)}` : "";
  return `<button type="button" class="switch${toneCls}" role="switch" aria-checked="${enabled ? "true" : "false"}" aria-label="${esc(label)}" ${attrs}>
    <span class="switch-track"><span class="switch-thumb"></span></span>
  </button>`;
}

/**
 * 单个状态胶囊徽标 (Status Badge Pill)
 */
function StatusPill({ tone = "neutral", label, value, href = "", title = "" }) {
  const dotTone = tone === "ok" ? "ok" : tone === "warn" ? "warn" : tone === "err" ? "err" : "";
  const inner = `<i class="s-dot ${dotTone}" aria-hidden="true"></i>
    <span class="status-pill-label">${esc(label)}</span>
    <span class="status-pill-sep" aria-hidden="true">·</span>
    <span class="status-pill-val">${esc(value)}</span>`;
  const titleAttr = title ? ` title="${esc(title)}"` : "";
  if (href) {
    return `<a class="status-pill tone-${esc(tone)}" href="${esc(href)}"${titleAttr}>${inner}</a>`;
  }
  return `<span class="status-pill tone-${esc(tone)}"${titleAttr}>${inner}</span>`;
}

/**
 * 顶部状态胶囊栏 (Status Pill / Banner)
 */
function StatusBanner(data) {
  const wecom = data.wecom || {};
  const schedule = data.schedule;
  const totalPeople = data.personnel_total || 0;
  const enabledPeople = Array.isArray(data.people)
    ? data.people.length
    : (data.personnel || []).filter((p) => p.enabled).length;

  let wecomTone = "err";
  let wecomVal = "未连接";
  if (wecom.configured) {
    if (wecom.last_test_ok === false) {
      wecomTone = "err";
      wecomVal = "连接异常";
    } else {
      wecomTone = "ok";
      wecomVal = wecom.last_test_ok ? "运行中" : "已配置";
    }
  }

  let peopleTone = "warn";
  let peopleVal = "待添加";
  if (enabledPeople > 0) {
    peopleTone = "ok";
    peopleVal = `${enabledPeople} 人启用`;
  } else if (totalPeople > 0) {
    peopleTone = "warn";
    peopleVal = "全部已停用";
  }

  const schedTone = schedule ? "ok" : "warn";
  const schedVal = schedule ? `${schedule.clock_in}–${schedule.clock_out}` : "待设置";

  const pills = [
    StatusPill({
      tone: wecomTone,
      label: "企业微信",
      value: wecomVal,
      href: "#/connect",
      title: wecom.last_test_message || "点击前往连接页配置企业 ID、AgentId 与 Secret",
    }),
    StatusPill({
      tone: peopleTone,
      label: "接收人",
      value: peopleVal,
      href: "#/people",
      title: "点击管理接收提醒的企业微信成员",
    }),
    StatusPill({
      tone: schedTone,
      label: "默认作息",
      value: schedVal,
      href: "#/schedules",
      title: "点击配置上下班时间与节假日调休",
    }),
  ].join("");

  const schedulerOn = Boolean(data.scheduler_enabled);

  return `<section class="status-banner" aria-label="系统运行状态">
    <div class="status-pills">${pills}</div>
    <div class="status-master">
      <button type="button" class="btn quiet sm" data-action="run-tick" title="立即执行一轮规则检查">${ICONS.play}<span>立即检查</span></button>
      <div class="master-switch-wrap">
        <span class="master-label">自动提醒 <span class="master-state ${schedulerOn ? "on" : "off"}">${schedulerOn ? "运行中" : "已暂停"}</span></span>
        ${Switch({
          enabled: schedulerOn,
          label: schedulerOn ? "暂停自动提醒总开关" : "开启自动提醒总开关",
          action: "toggle-scheduler",
          tone: "emerald",
        })}
      </div>
    </div>
  </section>`;
}

let infoSeq = 0;

function InfoTip(text, place) {
  const id = `info-${++infoSeq}`;
  const below = place === "below" ? " info-tip-below" : "";
  return `<span class="info-tip${below}">
    <button type="button" class="info-tip-btn" aria-label="说明" aria-describedby="${id}">i</button>
    <span class="info-tip-bubble" id="${id}" role="tooltip">${esc(text)}</span>
  </span>`;
}

/**
 * 页头组件
 */
function PageHeader({ title, subtitle, actions = "" }) {
  return `<header class="page-head">
    <div class="page-title-row">
      <h1 class="page-title">${esc(title)}</h1>
      ${subtitle ? InfoTip(subtitle, "below") : ""}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

/**
 * 空状态组件
 */
function EmptyState({ icon = "bell", title, description, action = "" }) {
  return `<div class="empty-box">
    <div class="empty-icon">${ICONS[icon] || ICONS.bell}</div>
    <strong>${esc(title)}${description ? InfoTip(description) : ""}</strong>
    ${action ? `<div style="margin-top:8px">${action}</div>` : ""}
  </div>`;
}

/**
 * 提醒规则卡片组件 (Card-based Rule Item)
 */
function RuleCard(rule, defaultSchedule, schedules = []) {
  const boundSchedule = rule.schedule_id
    ? schedules.find((s) => s.id === rule.schedule_id)
    : defaultSchedule;
  const baseClock = boundSchedule
    ? (rule.kind === "clock_out" ? boundSchedule.clock_out : boundSchedule.clock_in)
    : "";
  const triggerAt = baseClock ? computeTriggerTime(baseClock, rule.offset_minutes) : "";

  const whoLabel = rule.target_mode === "selected"
    ? `指定 ${rule.target_ids.length} 人`
    : "全部启用人员";
  const repeatLabel = rule.repeat_every_minutes
    ? `每 ${rule.repeat_every_minutes} 分钟 · 最多 ${rule.repeat_max} 次`
    : "只发一次";
  const scopeLabel = rule.schedule_name ? rule.schedule_name : "跟随默认/个人班次";

  const kindClass = rule.kind === "clock_out" ? "tag-out" : "tag-in";
  const offClass = rule.enabled ? "" : " is-off";

  return `<article class="rule-card${offClass}">
    <div class="rule-main">
      <div class="rule-head">
        <h2 class="rule-title">${esc(rule.name)}</h2>
        ${triggerAt ? `<span class="rule-time-chip">${ICONS.clock}<span>${esc(triggerAt)}</span></span>` : ""}
        ${rule.enabled ? "" : `<span class="rule-paused-chip">已停用</span>`}
      </div>
      <p class="rule-preview">${esc(sampleMessage(rule, boundSchedule))}</p>
      <div class="tag-list" aria-label="规则条件">
        <span class="tag ${kindClass}">${esc(kindLabel(rule.kind))}</span>
        <span class="tag">${ICONS.clock}<span>${esc(offsetLabel(rule.offset_minutes))}</span></span>
        <span class="tag">${ICONS.users}<span>${esc(whoLabel)}</span></span>
        <span class="tag tag-muted">${ICONS.repeat}<span>${esc(repeatLabel)}</span></span>
        ${rule.require_not_checked ? `<span class="tag tag-ok">${ICONS.shield}<span>已打卡跳过</span></span>` : `<span class="tag tag-muted">忽略打卡状态</span>`}
        ${rule.schedule_name ? `<span class="tag tag-muted">${esc(scopeLabel)}</span>` : ""}
      </div>
    </div>
    <div class="rule-side">
      ${Switch({
        kind: "rule",
        id: rule.id,
        enabled: rule.enabled,
        label: `${rule.enabled ? "停用" : "启用"}提醒规则：${rule.name}`,
      })}
      <span class="ctrl-divider" aria-hidden="true"></span>
      <div class="row-actions">
        <button type="button" class="btn ghost sm" data-action="edit-rule" data-id="${rule.id}" aria-label="编辑 ${esc(rule.name)}">${ICONS.edit}<span>编辑</span></button>
        <button type="button" class="btn ghost danger-hover sm" data-action="delete-rule" data-id="${rule.id}" data-name="${esc(rule.name)}" aria-label="删除 ${esc(rule.name)}">${ICONS.trash}<span>删除</span></button>
      </div>
    </div>
  </article>`;
}

/**
 * 班次卡片组件
 */
function ScheduleCard(item) {
  const offClass = item.enabled ? "" : " is-off";
  return `<article class="rule-card${offClass}">
    <div class="rule-main">
      <div class="rule-head">
        <h2 class="rule-title">${esc(item.name)}</h2>
        <span class="rule-time-chip">${ICONS.clock}<span>${esc(item.clock_in)} – ${esc(item.clock_out)}</span></span>
        ${item.is_default ? `<span class="tag tag-ok" style="min-height:22px;padding:1px 8px">全员默认</span>` : ""}
        ${item.enabled ? "" : `<span class="rule-paused-chip">已停用</span>`}
      </div>
      <div class="tag-list">
        <span class="tag">${ICONS.calendar}<span>${esc(weekdayLabel(item.weekdays))}</span></span>
        <span class="tag">${ICONS.users}<span>${item.person_name ? `专属：${esc(item.person_name)}` : "适用全员"}</span></span>
        <span class="tag tag-muted">${item.skip_holidays ? "法定节假日跳过 · 补班照常" : "忽略节假日标记"}</span>
        <span class="tag tag-muted">${esc(item.timezone || "Asia/Shanghai")}</span>
      </div>
    </div>
    <div class="rule-side">
      ${Switch({
        kind: "schedule",
        id: item.id,
        enabled: item.enabled,
        label: `${item.enabled ? "停用" : "启用"}班次：${item.name}`,
      })}
      <span class="ctrl-divider" aria-hidden="true"></span>
      <div class="row-actions">
        <button type="button" class="btn ghost sm" data-action="edit-schedule" data-id="${item.id}" aria-label="编辑 ${esc(item.name)}">${ICONS.edit}<span>编辑</span></button>
        <button type="button" class="btn ghost danger-hover sm" data-action="delete-schedule" data-id="${item.id}" data-name="${esc(item.name)}" aria-label="删除 ${esc(item.name)}">${ICONS.trash}<span>删除</span></button>
      </div>
    </div>
  </article>`;
}

function askConfirm({ title, body, confirmLabel = "确认", danger = true } = {}) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const titleId = `confirm-title-${stamp}`;
    const bodyId = `confirm-body-${stamp}`;
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.setAttribute("aria-describedby", bodyId);
    dialog.innerHTML = `
      <div class="confirm-scrim" data-confirm="cancel"></div>
      <div class="confirm-card">
        <span class="confirm-mark" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2.4 14.2 13.4H1.8L8 2.4Z"/>
            <path d="M8 6.3v3.1"/>
            <path d="M8 11.55h.01"/>
          </svg>
        </span>
        <h2 id="${titleId}"></h2>
        <p id="${bodyId}"></p>
        <div class="confirm-actions">
          <button type="button" class="btn quiet confirm-cancel" data-confirm="cancel">取消</button>
          <button type="button" class="btn ${danger ? "danger confirm-go" : "primary confirm-go"}" data-confirm="ok"></button>
        </div>
      </div>`;
    dialog.querySelector("h2").textContent = title || "";
    dialog.querySelector("p").textContent = body || "";
    dialog.querySelector(".confirm-go").textContent = confirmLabel || "确认";
    document.body.appendChild(dialog);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let settled = false;
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
        return;
      }
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      finish(true);
    };
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey, true);
      dialog.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      const close = () => {
        if (dialog.open) dialog.close();
        dialog.remove();
        if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
        resolve(Boolean(accepted));
      };
      if (reduceMotion) {
        close();
        return;
      }
      dialog.classList.add("is-leaving");
      window.setTimeout(close, 200);
    };
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish(false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        finish(false);
        return;
      }
      const hit = event.target.closest("[data-confirm]");
      if (!hit || !dialog.contains(hit)) return;
      finish(hit.dataset.confirm === "ok");
    });
    document.addEventListener("keydown", onKey, true);

    dialog.showModal();
    dialog.querySelector(".confirm-cancel").focus();
    if (reduceMotion) dialog.classList.add("is-shown");
    else requestAnimationFrame(() => dialog.classList.add("is-shown"));
  });
}

window.BandianUI = {
  esc,
  ICONS,
  askConfirm,
  kindLabel,
  offsetLabel,
  weekdayLabel,
  minutesOf,
  computeTriggerTime,
  sampleMessage,
  Switch,
  StatusPill,
  StatusBanner,
  InfoTip,
  PageHeader,
  EmptyState,
  RuleCard,
  ScheduleCard,
};
})();
