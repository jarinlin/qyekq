---
name: qyekq
description: 夜班台上的打卡提醒后台。近黑画布，一盏薰衣草灯。
colors:
  primary: "#5e6ad2"
  on-primary: "#ffffff"
  primary-hover: "#828fff"
  primary-focus: "#5e69d1"
  ink: "#f7f8f8"
  ink-muted: "#d0d6e0"
  ink-subtle: "#8a8f98"
  ink-tertiary: "#62666d"
  canvas: "#010102"
  surface-1: "#0f1011"
  surface-2: "#141516"
  surface-3: "#18191a"
  hairline: "#23252a"
  hairline-strong: "#34343a"
  success: "#27a644"
typography:
  display:
    fontFamily: "Satoshi, 'Noto Sans SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "1.2"
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "'JetBrains Mono', ui-monospace, 'Cascadia Mono', monospace"
    fontSize: "52px"
    fontWeight: 500
    lineHeight: "1.05"
    letterSpacing: "-1.8px"
  title:
    fontFamily: "Satoshi, 'Noto Sans SC', 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "1.35"
    letterSpacing: "-0.3px"
  body:
    fontFamily: "'Noto Sans SC', Satoshi, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.5"
    letterSpacing: "-0.05px"
  label:
    fontFamily: "'Noto Sans SC', Satoshi, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.3"
    letterSpacing: "0.4px"
rounded:
  mark: "4px"
  control: "8px"
  card: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "22px"
  page-y: "28px"
  page-x: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
  button-primary-active:
    backgroundColor: "{colors.primary-focus}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
  button-quiet-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-subtle}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    height: "40px"
  chip-selected:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 14px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px 22px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-subtle}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  nav-link-current:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "40px"
  switch-on:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    width: "52px"
    height: "40px"
---

# Design System: qyekq

## Overview

**Creative North Star: "夜班台"**

夜班台上只有一盏灯。界面密、安静、可扫读，装饰让位给时间和状态。一个人坐在这张近黑的桌子前改人员和规则，眼睛先落到时间和发送状态上。

控件克制而精确，贴在表面上，薰衣草蓝只标出能按的主动作。深度靠画布、表面和发丝边一层层排开，卡片顶上留一条很弱的高光。确认过的取舍是：背景不用大气渐变，不加第二种彩色强调，不用投影造深度，不做营销页式的大标题和装饰插画。

标题用几何无衬线，正文用中文黑体，时间和账号用等宽数字。界面文案使用中文。侧栏字标是 qyekq。

**Key Characteristics:**

- 近黑画布上只有一盏薰衣草灯
- 表面深浅、发丝边和顶边高光构成深度
- Satoshi 标题，Noto Sans SC 正文，JetBrains Mono 时间
- 控件圆角小，点击高度至少 40px

## Colors

整页是近黑到浅灰的阶梯，彩色只有薰衣草蓝这一盏灯；绿色只点在状态上。

### Primary

- **薰衣草蓝** (#5e6ad2): 主按钮、开着的开关、到点状态点、进度上的当前点，以及复选框的强调色。选中文字的底是这只蓝的 35% 透明。
- **灯上的白** (#ffffff): 主按钮上的字，以及开着的开关里的圆点。
- **薰衣草亮** (#828fff): 主按钮悬停。
- **薰衣草按下** (#5e69d1): 主按钮按下。焦点环用同一色相，2px，70% 不透明。

### Neutral

- **近黑画布** (#010102): 页面底色，也是输入框的底。
- **表面一** (#0f1011): 卡片、普通按钮、侧栏表单。
- **表面二** (#141516): 悬停的普通按钮、当前导航、选中的筛选。
- **表面三** (#18191a): 按下的普通按钮、选中的星期、底部提示。
- **纸白** (#f7f8f8): 标题和正文。
- **次级灰** (#d0d6e0): 页首说明、日期、规则正文。
- **说明灰** (#8a8f98): 眉题、未选中的导航、辅助提示。
- **弱灰** (#62666d): 禁用文字，以及还没激活的状态点。
- **发丝边** (#23252a): 卡片、普通按钮、表格行、侧栏与内容的分隔。
- **强发丝边** (#34343a): 输入框、提示条、开关轨道、选中筛选的边。
- **状态绿** (#27a644): 只有 6px 的状态点。表示已发送，或连接已经可用。

### Named Rules

**The One Lamp Rule.** 薰衣草蓝只留给主按钮、开着的开关、键盘焦点、到点状态，以及进度上的当前点。一屏里它应当是稀少的。

**The Status Dot Rule.** 成功绿只出现在 6px 的状态点上，表示已发送或已连接。

## Typography

**Display Font:** Satoshi（回退 Noto Sans SC、Segoe UI、Microsoft YaHei）

**Body Font:** Noto Sans SC（回退 Satoshi、Segoe UI、Microsoft YaHei）

**Label/Mono Font:** 眉题用 Noto Sans SC；时间、账号和记录编号用 JetBrains Mono（回退 ui-monospace、Cascadia Mono）

**Character:** 标题收得紧，像桌面上的铭牌。正文按中文阅读的节奏排。大号等宽数字负责报时，不拿来排句子。

### Hierarchy

- **Display**（600，28px，行高 1.2，字距 -0.6px）: 每一页的标题。窄屏仍用这一级，不放大成海报字。
- **Headline**（500，52px，行高 1.05，字距 -1.8px）: 今日看板上的时钟。窄于 800px 时降到 40px，字距 -1px。下一次提醒的时间用同一套等宽，28px。
- **Title**（500，20px，行高 1.35，字距 -0.3px）: 卡片和规则的名称。侧栏表单的标题是 22px，字距 -0.4px。侧栏字标是 18px、600、字距 -0.4px。
- **Body**（400，16px，行高 1.5，字距 -0.05px）: 说明和表单里的句子。表格单元格是 14px。输入框保持 16px，避免手机上聚焦时被放大。
- **Label**（500，13px，行高 1.3，字距 0.4px）: 卡片眉题和字段名。表头是 12px，字距为 0。

### Named Rules

**The Three Voices Rule.** 标题用 Satoshi，正文用 Noto Sans SC，时间、账号和记录编号用 JetBrains Mono。等宽字体不进入句子。

## Layout

宽屏是一张桌子：左侧 220px 导航，右侧内容最宽 1180px，页边距上 28px、左右 32px、下 72px。今日页是六列看板，间隙 12px。时钟占四列，下一次提醒占两列，小卡片各占两列，通栏占满六列。页头标题和操作左右分开，间距 16px。

窄于 1024px 时，看板改成两列，时钟和通栏横跨两列。窄于 800px 时，导航收成顶部一条，品牌说明和侧栏状态藏起，内容页边距改为 20px 16px 56px。窄于 720px 时，看板、双列表单和规则行都收成一列。触控指针下，按钮和筛选的高度提到 44px。

### Named Rules

**The Desk First Rule.** 宽屏保持左侧导航和六列看板。800px 以下导航变成顶栏，720px 以下看板变成一列。

## Elevation & Depth

深度是一层层的表面，不是浮起来的卡片。顺序是近黑画布、表面一、表面二、表面三。卡片、当前导航和提示条用 1px 发丝边，再加顶上一条内高光：卡片和提示是 `inset 0 1px 0 rgba(255, 255, 255, 0.07)`，当前导航和选中筛选是 `inset 0 1px 0 rgba(255, 255, 255, 0.06)`。侧栏表单贴在右边，左边一条发丝边，内侧一条 `inset 1px 0 0 rgba(255, 255, 255, 0.06)`，背后的遮罩是 `rgba(0, 0, 0, 0.56)`。进度上的当前点有一圈 `0 0 0 3px rgba(94, 106, 210, 0.22)`，用来标位置。

### Named Rules

**The Tonal Stair Rule.** 深度从近黑画布排到表面三，靠明度差、1px 发丝边和顶边内高光。落影不参与分层。

## Shapes

角是小的。标识 4px，按钮、输入、导航、星期和提示 8px，卡片 12px。筛选、开关、状态点和进度条用全圆。标识是 14px 的薰衣草方块，顶上一条更亮的内高光 `inset 0 1px 0 rgba(255, 255, 255, 0.35)`。

### Named Rules

**The Small Radius Rule.** 控件 8px，卡片 12px，标识 4px。全圆只给胶囊、开关、状态点和进度条。

## Components

控件贴在表面上。悬停只换背景色，按下不位移。过渡用 `cubic-bezier(0.23, 1, 0.32, 1)`，颜色约 180ms。系统要求减少动效时，动画和过渡收到 0.01ms。

### Buttons

- **Shape:** 轻轻的圆角（8px），高度至少 40px，内边距 8px 14px，字号 14px、字重 500。
- **Primary:** 薰衣草蓝底，白字，边框透明。悬停换成薰衣草亮，按下换成薰衣草按下。
- **Hover / Focus:** 只改背景。键盘焦点是 2px 薰衣草按下色的描边，偏移 2px。
- **Quiet:** 透明底、纸白字、发丝边。悬停铺表面二，按下铺表面三。更小的一档只把左右内边距收到 10px。禁用时字色降到弱灰，底回到表面一。

### Chips

- **Style:** 全圆胶囊，高 40px，内边距 6px 14px。未选中是透明底、说明灰字、发丝边。
- **State:** 选中后底改表面二，字改纸白，边改强发丝边，并加上那条顶边内高光。

### Cards / Containers

- **Corner Style:** 卡片圆角（12px）。
- **Background:** 表面一。眉题用说明灰，卡片标题用 Title 一级。
- **Shadow Strategy:** 见 Elevation。顶边内高光，没有落影。
- **Border:** 1px 发丝边。
- **Internal Padding:** 20px 22px。看板里的卡片进场 420ms，自下 8px 升起，相邻卡片错开 30–40ms。标记为安静的视图不播放这段进场。

### Inputs / Fields

- **Style:** 近黑画布底，1px 强发丝边，圆角 8px，内边距 10px 12px，字号 16px，高度至少 44px。多行输入至少 96px。字段名是 13px 的次级灰，和输入框相距 6px。
- **Focus:** 边框改为透明，改用 2px 焦点环贴在边上。
- **Error / Disabled:** 校验文案走页面自己的提示条，输入框没有单独的错误色。复选框 16px，强调色用薰衣草蓝。星期是一排至少 44px 宽、40px 高的小按钮，选中后底为表面三。

### Navigation

- **Style:** 左侧 220px，项与项相距 2px。每一项高 40px，左右 12px，圆角 8px，14px、字重 500。默认说明灰。悬停时字变纸白，底为表面一。当前页底为表面二，字为纸白，带顶边内高光。窄于 800px 时，导航横过来贴在顶部，品牌旁注和连接状态隐藏，当前项的样式不变。

### Clock

今日页的主读数。眉题用 Label，时间用 Headline，日期用 14px 次级灰。时钟下方是一条 2px 的强发丝边进度，当前点是 8px 的薰衣草圆点。

### Sheet

从右侧进入的表单，宽不超过 440px，底是表面一，内边距 24px 22px 40px。标题 22px。进场 240ms，自右 20px 滑入。打开时页面不再滚动。底部提示居中，底是表面三，圆角 8px，出现时上移 8px。

### Named Rules

**The Still Control Rule.** 悬停和按下只更换背景色。控件不位移，不放大。

## Do's and Don'ts

### Do:

- **Do** 用近黑画布托住表面一到表面三，深度只靠明度差、1px 发丝边和顶边内高光。
- **Do** 把薰衣草蓝留给主按钮、开着的开关、键盘焦点和到点状态。
- **Do** 标题用 Satoshi，正文用 Noto Sans SC，时间和账号用 JetBrains Mono。
- **Do** 让按钮和导航的点击高度至少达到 40px，输入字号保持 16px。
- **Do** 用 `cubic-bezier(0.23, 1, 0.32, 1)` 做展开和状态切换；系统要求减少动效时，把时长收到 0.01ms。

### Don't:

- **Don't** 用大气渐变当背景。
- **Don't** 加第二种彩色强调；绿色只表示已发送或成功。
- **Don't** 用投影造深度。
- **Don't** 做营销页式的大标题和装饰插画。
