# JINGTANG V1 UX Architecture & Design Authority

**Status:** Approved  
**Design Revision:** 1  
**Effective Date:** 2026-08-20  
**Delivery:** JINGTANG 海外官网与 SaaS 第一版上线  
**Authority Dimension:** Approved Design Target — material IA、screen responsibility、interaction、UX state、responsive 与 consent semantics  
**Upstream Authority:** [Approved `BASELINE.md`](deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Revision 1  
**Approval Scope:** D-01 ～ D-12 及由这些决策拥有的规范性 material UX semantics  
**Approval Provenance:** Human Owner 于 2026-08-20 在 originating Codex task 中明确授权“批准按推荐组合修订”  
**Purpose:** 固化 V1 已批准的 material UX decisions，作为 Design Readiness 与后续 planning 的设计输入  
**Not Owned Here:** Product Scope、Acceptance Criteria、API Contract、Database Schema、技术架构、实现 Stage、视觉 Token、具体组件实现

---

# 1. Design Intent

JINGTANG V1 的体验目标不是让用户感受到“自动化功能很多”，而是：

> **让一个真实企业清楚、安全并且可控地完成社交账号授权、内容创建、团队审批、平台发布、状态跟踪以及授权撤销。**

整个产品体验应持续强化四个感受：

### Clear

用户始终知道：

- 当前在哪个 Workspace；
- 正在操作哪个社交账号；
- 哪些平台被选择；
- 内容当前处于什么状态；
- 下一步动作是什么。

### Controlled

任何外部写入行为必须具有明确的用户控制。

用户必须能够在最终动作前理解：

- 发布什么；
- 发布到哪里；
- 谁在执行；
- 是立即发布还是 Schedule。

### Trustworthy

OAuth、权限、发布状态和数据删除不是后台技术概念。

这些能力需要成为用户能看到、能理解、能操作的产品体验。

### Enterprise-ready

体验必须体现：

- Workspace
- Role
- Approval
- Account Ownership
- Audit
- Explicit Publishing

而不是个人 Social Posting Utility。

---

# 2. UX Architecture Principle

V1 采用：

> **Workspace-centered architecture**

而不是：

> Platform-centered architecture

用户进入 JINGTANG 后首先属于一个 Workspace。

Workspace 是：

- Members
- Roles
- Channels
- Content
- Approvals
- Publishing Activity
- Audit

的共同体验边界。

用户不需要分别进入：

> YouTube Product  
> Instagram Product  
> Facebook Product

再操作内容。

平台差异只在需要平台特定决策的位置出现。

---

# 3. Primary SaaS Information Architecture

V1 一级导航采用：

```text
Workspace

├── Home
├── Content
├── Approvals
├── Calendar
├── Channels
├── Activity
└── Settings
```

---

# 4. Home

## Responsibility

Home 只负责回答：

> 当前 Workspace 有什么需要关注？

不承担完整内容编辑或账号管理责任。

建议包含：

### Connected Channels

已连接账号摘要。

### Pending Approvals

当前等待审批的内容。

### Upcoming Publishing

已经安排的发布。

### Needs Attention

授权失效、发布失败、需要重新授权等。

### Recent Activity

最近的关键操作。

---

# 5. Content

## Responsibility

Content 是所有内容工作对象的主要入口。

用户可以：

- 查看内容；
- 创建内容；
- 编辑 Draft；
- 查看状态；
- 进入详情；
- 根据权限继续下一步操作。

Content 不直接承担：

- OAuth 管理；
- Workspace 成员管理；
- Audit 查询。

---

# 6. Approvals

## Responsibility

Approvals 是需要人工判断的内容队列。

主要面对：

- Approver / Publisher

展示：

### Pending

等待当前用户审批。

### Approved

已经批准但尚未发布。

### Rejected

被拒绝或要求修改。

Approvals 不应成为第二套 Content 数据模型。

它只是：

> 对符合审批条件的 Content 提供 Role-specific View。

---

# 7. Calendar

## Responsibility

Calendar 用于查看已经存在时间语义的内容。

包括：

- Scheduled
- Upcoming
- Published

如果某个平台不支持 Schedule：

不能为了 Calendar 一致性制造假的时间能力。

Calendar 是已有 Publishing Data 的视图，而不是独立业务对象。

---

# 8. Channels

## Responsibility

Channels 是所有外部账号授权的唯一主要管理入口。

负责：

- 查看连接账号；
- Connect；
- Reauthorize；
- Disconnect；
- 查看连接状态；
- 查看平台能力状态。

不负责：

- 创建内容；
- 审批内容；
- 编辑帖子。

---

# 9. Activity

## Responsibility

Activity 提供：

> 用户可理解的 Workspace 操作历史。

包括：

- Account Connected
- Account Disconnected
- Reauthorization
- Member Changes
- Content Submitted
- Content Approved
- Content Rejected
- Publishing Started
- Publishing Completed
- Publishing Failed
- Data Deletion

它是 Audit Log 的用户体验表达。

Audit 的技术数据结构由后续机器真源或 Domain Authority 拥有，本文件只拥有用户可见语义。

---

# 10. Settings

V1 Settings 至少分为：

```text
Settings

├── Workspace
├── Members & Roles
└── Data & Account
```

V1 不需要形成复杂 Enterprise Administration Console。

## Onboarding and Team Setup Responsibility

公开身份入口负责：

- Sign Up；
- Login；
- Password Reset 或等价身份恢复流程。

Workspace Onboarding 负责：

- Create Workspace；
- Join Workspace / Accept Invitation；
- 明确当前进入的 Workspace。

`Settings → Members & Roles` 负责 Workspace 建立后的：

- Invite Member；
- Remove Member；
- Assign / Change Role。

这些责任不能被隐藏在 Channels 或 Content Flow 中。

---

# 11. Core UX Flow

JINGTANG V1 的 Entry and Setup Journey：

```text
Sign Up / Login
↓
Password Reset when needed
↓
Create or Join Workspace
↓
Invite Members
↓
Assign Roles
↓
Home
```

完成 Workspace setup 后，Primary Operational Journey 为：

```text
Connect
↓
Create
↓
Customize
↓
Preview
↓
Submit
↓
Approve
↓
Publish
↓
Track
↓
Revoke
↓
Delete
```

这条流程是产品体验主线。

其他页面设计不得制造与其竞争的第二条主要发布路径。

---

# 12. Material Design Decision D-01

## Content Creation Model

V1 采用：

> **One Content → Multiple Platform Versions**

而不是：

> 每个平台分别创建完全独立的 Post。

用户首先建立一个 Content：

```text
Content
└── Source Asset
```

然后根据用户主动选择的平台形成：

```text
Platform Version
├── YouTube
├── Instagram
└── Facebook
```

每个 Platform Version 拥有自己可编辑的平台字段。

---

# 13. Create Flow

V1 使用单一连续 Composer：

```text
1. Content
↓
2. Platforms
↓
3. Customize
↓
4. Review
```

而不是大量独立页面跳转。

---

# 14. Step 1 — Content

用户：

- 上传 Source Asset；
- 填写必要的内部内容信息；
- 等待上传完成。

需要处理：

- Empty
- Uploading
- Upload Failed
- Upload Complete

如果上传失败：

不能允许后续发布流程假装可继续。

---

# 15. Step 2 — Platforms

显示所有当前 Workspace 已连接且可用于当前内容的账号。

例如：

```text
YouTube
ABC Global

Instagram
@abc_global

Facebook
ABC Official
```

用户必须主动选择目标账号。

未选择的平台：

不会收到任何内容。

---

# 16. Platform Availability

账号可显示：

- Ready
- Reauthorization Required
- Unsupported for this content
- Temporarily Unavailable

不能让用户走到最终 Publish 才第一次发现账号无法使用。

---

# 17. Step 3 — Customize

平台使用：

> 共用整体 Layout + Platform-specific Fields

例如：

## YouTube

- Title
- Description
- Privacy
- Required audience settings

## Instagram

- Caption
- Supported post options

## Facebook

- Caption
- Supported publishing options

不同平台不能为了视觉统一而拥有虚假的相同字段。

---

# 18. Platform Switching

Customize 阶段推荐使用：

> Platform Tabs / Platform Selector

用户可以在平台版本之间切换。

例如：

```text
YouTube ✓
Instagram !
Facebook ✓
```

状态应能告诉用户：

- Complete
- Incomplete
- Error

而不是只有 Platform Logo。

---

# 19. Step 4 — Review

Review 是发布前的最终用户检查界面。

必须明确显示：

### Content

即将发布的素材。

### Platforms

每一个目标平台。

### Accounts

每一个具体账号。

### Platform Copy

最终发送的字段。

### Publishing Mode

Publish Now 或 Schedule。

### Approval State

是否已经满足当前 Workspace 的发布权限条件。

---

# 20. Material Design Decision D-02

## Approval 与 Publish 必须是两个不同语义

V1 规定：

> Approval 不等于 Publish。

批准内容只是：

> 内容已经被允许进入发布阶段。

真正向外部平台写入仍然需要：

> Publisher 的明确 Publish Confirmation。

因此：

```text
Editor
↓
Submit
↓
Approver / Publisher
↓
Approve
↓
Publish Confirmation
↓
External Publish
```

如果同一用户同时拥有审批和发布权限：

可以在一次连续体验中完成：

> Approve → Confirm Publish

但系统内部仍保留两个不同动作语义。

---

# 21. Approval Flow

Editor：

```text
Draft
↓
Submit for Approval
```

Approver：

```text
Review
↓
Approve
or
Reject
```

Reject 必须允许：

> 给出原因或修改意见。

第一版不需要复杂多人会签。

---

# 22. Publish Confirmation

这是整个 V1 最重要的 Trust Screen 之一。

最终动作前必须明确展示：

> **You are about to publish this content to:**

例如：

```text
YouTube
ABC Global

Instagram
@abc_global
```

并展示：

- 内容预览；
- 最终文案；
- 发布方式；
- Schedule 时间（如适用）。

Primary Action：

> Publish

或：

> Schedule

用户点击才开始外部写入。

---

# 23. Material Design Decision D-03

## Multi-platform Publishing 使用“一个用户动作，多平台独立执行”

V1 允许用户在 Review 中一次确认多个平台。

但产品语义必须是：

> 一个 Confirmation  
> → 多个独立 Platform Publish Executions

因此可能出现：

```text
YouTube     Published
Instagram   Failed
Facebook    Processing
```

整个 Content 不能因为两个成功、一个失败就统一显示：

> Published

---

# 24. State Ownership Model

UX 必须区分三种不同的状态概念。

## Content Lifecycle

描述：

> 内容当前处于团队工作流的哪个阶段。

例如：

- Draft
- Pending Approval
- Rejected
- Approved

## Publishing Intent

描述：

> 用户已经决定何时发布。

例如：

- Ready
- Scheduled

## Platform Execution

描述：

> 每个平台真正发生了什么。

例如：

- Publishing
- Processing
- Published
- Failed
- Needs Attention
- Cancelled

这三个概念在 UI 上可以组合显示。

但不能混成一个含义模糊的大状态。

具体机器状态模型由后续 Domain / Contract Authority 决定。

本 Design Authority 只拥有：

> 用户必须能够区分这三种语义。

---

# 25. Material Design Decision D-04

## Content Detail 作为 Single Operational View

每个 Content 使用一个主要详情页面。

推荐包含：

### Overview

Source Asset 与基本信息。

### Platform Versions

各平台最终版本。

### Approval

审批历史和当前状态。

### Publishing

每个平台的执行状态。

### Activity

与该 Content 直接相关的操作。

避免为：

- Approval
- Publish Result
- Error
- History

分别制造彼此断开的详情页面。

---

# 26. Publishing Result UX

发布后不要只显示 Toast：

> Published successfully.

应进入长期可回看的状态。

例如：

```text
YouTube
Published
ABC Global
Published 18:31
View on YouTube
```

失败：

```text
Instagram
Failed

Reason:
Authorization expired.

Action:
Reconnect Instagram
```

错误必须尽量转化为：

> 用户能理解的下一步动作。

---

# 27. Needs Attention

`Needs Attention` 是用户体验状态，不是笼统 Error Bucket。

适用于：

- Token 失效；
- Account permission changed；
- Platform requires reauthorization；
- Publish requires user action；
- 可恢复的平台问题。

应尽量附带：

> Resolve

入口。

---

# 28. Material Design Decision D-05

## Channel Connection 独立于 Content

账号授权只在：

> Channels

进行。

Create Flow 中如果用户需要一个尚未连接的账号：

显示：

> Connect in Channels

或：

> Connect Account

但真正 OAuth Flow 仍进入 Channels-owned Connection Flow。

不能在多个页面拥有不同版本的 OAuth 管理体验。

---

# 29. Channel State Semantics

用户至少需要理解：

### Not Connected

当前没有授权。

### Connecting

OAuth 过程进行中。

### Connected

授权当前可用。

### Reauthorization Required

不能继续安全使用，需要重新授权。

### Disconnecting

撤销与清理进行中。

### Disconnected

连接已经解除。

具体 Token State 属于实现和 Contract，不由此文件拥有。

---

# 30. Connect Flow

V1 YouTube Connect Flow：

```text
Channels
↓
Connect YouTube
↓
Explain What Happens
↓
Continue to Google
↓
Official OAuth
↓
Return to JINGTANG
↓
Connection Result
```

进入外部 OAuth 前：

简要解释：

- 用户将离开 JINGTANG；
- 登录发生在平台自身；
- JINGTANG 不获取平台密码；
- 用户将看到请求权限。

不需要用大段法律文案阻塞用户。

## Terms and Privacy Consent Gate

注册时必须由用户主动同意当前：

- Terms of Service；
- Privacy Policy。

Consent 选项不得预先勾选，并提供可直接访问的 Terms 与 Privacy 链接。

在第一次 YouTube Connect 或访问任何需要 YouTube API 的功能前，系统必须确认当前用户已经同意适用版本。若尚未同意，或 Terms / Privacy 的数据用途发生实质变化：

1. 在继续 OAuth 或 API 功能前显示阻断式 Consent Step；
2. 清楚显示当前适用的 Terms 与 Privacy；
3. 提供明确的 Accept 与 Cancel；
4. 用户选择 Cancel 时不启动 OAuth 或 API 操作，并返回原任务；
5. 用户重新同意后才允许继续。

Consent Version 与 Timestamp 的机器记录由后续 Contract / Data Authority 拥有；本 Design Authority 拥有上述用户可见触发和控制语义。

---

# 31. Reauthorization

当账号需要重新授权：

优先显示：

> Reconnect / Reauthorize

而不是：

> Error 401

用户完成以后：

返回同一 Channel。

如果用户来自发布失败场景：

重新授权成功后应提供：

> Return to Content

而不是让用户重新寻找原任务。

---

# 32. Material Design Decision D-06

## Disconnect 与 Delete 分离

V1 明确区分：

### Disconnect Channel

停止 JINGTANG 使用该外部账号。

### Delete JINGTANG Account / Workspace Data

删除 JINGTANG 自身保存的数据。

### Delete Content on Third-party Platform

如果未来支持，这是另一种明确的外部写入行为。

三者不能用一个：

> Delete

按钮混在一起。

---

# 33. Disconnect Flow

建议：

```text
Channel
↓
Disconnect
↓
Confirmation
↓
Revoke in progress
↓
Disconnected
```

Confirmation 应说明：

- 未来发布将停止；
- 授权将撤销；
- JINGTANG 将按适用规则清理相关授权数据；
- 已经发布在平台上的内容不会因为 Disconnect 自动删除。

---

# 34. Destructive Action UX

对于：

- Disconnect
- Delete Workspace
- Delete Account

必须：

- 清楚写明影响；
- 有明确 Primary / Cancel；
- 避免模糊语言。

不依靠颜色作为唯一风险提示。

---

# 35. Role-sensitive UX

用户不应该看到大量自己永远不能执行的 Primary Actions。

例如 Editor：

可以看到：

> Submit for Approval

不能看到可点击：

> Publish

Viewer：

可以看到内容状态。

不能看到：

> Edit / Submit / Publish。

如果一个动作不可用但解释其存在有价值：

可以 Disabled + Reason。

---

# 36. Navigation by Role

V1 不建议为每种角色建立完全不同导航。

统一 IA：

> 保持一致。

差异主要发生在：

- 页面权限；
- Action availability；
- Relevant queue。

这样减少团队协作时的认知差异。

---

# 37. Empty States

每一个一级 Screen 都需要真实 Empty State。

例如 Channels：

> No channels connected yet.

Primary CTA：

> Connect a channel

Content：

> Create your first content.

Approvals：

> Nothing waiting for your approval.

Empty State 应推动真实下一步。

不使用无意义的装饰 Illustration 取代 Action。

---

# 38. Loading States

任何调用外部平台数据的 Screen：

必须考虑独立 Loading。

尤其：

- OAuth Return
- Channels
- Publishing Status
- Reauthorization

Loading 不代表成功。

不能在 API 返回前提前显示：

> Connected

或：

> Published。

---

# 39. Error States

至少区分：

## User-correctable

例如：

- missing field
- invalid media
- account reauthorization required

## Retryable

例如：

- temporary platform error

## Non-retryable

例如：

- unsupported permission
- platform rejects content

UI 不需要暴露技术堆栈。

但应提供：

> 可理解原因 + 可执行下一步。

---

# 40. Website Experience Architecture

官网与 SaaS 是同一个产品身份的两个不同 Experience。

官网负责：

> Explain + Prove + Convert

SaaS 负责：

> Operate

官网不能尝试模拟完整 SaaS。

---

# 41. Website IA

V1 网站一级 IA 采用：

```text
Home

Platform
├── Social Publishing
└── Workflow & Approvals

Integrations
├── Available integrations
└── Coming Soon integrations

Solutions

Security

Company
├── About
└── Contact

Legal
├── Privacy
├── Terms
└── Data Deletion

Sign In
Book a Demo
```

`Solutions` 是已批准的 V1 一级入口。其页面只能组织与真实客户场景相关的内容，不得把未实现能力改写为 Available。

AI Visibility 若 SaaS 尚未正式上线：

使用：

> AI Visibility — Early Access / Services

而不与正式 SaaS 能力产生虚假等价。

---

# 42. Home Responsibility

Home 只需要完成：

```text
Understand
↓
Trust
↓
Explore
↓
Book Demo
```

不承担：

- 完整 Documentation；
- 所有平台 Permission 解释；
- 法律政策正文。

---

# 43. Integration Page Responsibility

每个 Integration Page 负责同时回答：

### Capability

能做什么。

### Status

Available / Beta / Coming Soon。

### Authorization

如何授权。

### User Control

用户如何发布。

### Data

访问与保存什么。

### Disconnect

如何断开。

### Legal

相关政策入口。

Integration Page 同时是：

> Sales Evidence + Developer Review Evidence。

---

# 44. Coming Soon UX

Coming Soon Integration：

允许：

- 了解未来方向；
- 加入 Waitlist；
- Contact Sales。

禁止：

- Connect
- Publish
- 假截图
- Supported Now

---

# 45. Visual Direction

V1 视觉方向只冻结原则，不冻结具体 Style System。

推荐：

- Professional
- Calm
- Technical
- Global
- Enterprise
- High-information clarity

避免：

- Neon AI gimmick
- 夸张 AI 动效
- 大量营销渐变
- Crypto-style dashboard
- “爆单神器”式视觉

具体：

- Color
- Type Scale
- Radius
- Spacing
- Motion
- Component Token

属于后续 Derived Design Specification / Design System，不属于当前 Material Design Target。

---

# 46. Responsive Principle

V1 响应式边界批准为：

官网：

> Mobile-first responsive required.

SaaS：

第一版优先保证：

> Desktop / Laptop operational experience.

移动端至少保证：

- 能查看状态；
- 不出现严重布局破坏。

不把完整手机端复杂 Content Publishing Workflow 作为 V1 material target，除非 Baseline 后续明确 Amendment。

该边界属于已批准的 V1 Design Target，不得在实现阶段把“桌面优先”扩大解释为移动端可以出现不可读取状态、关键内容溢出或严重布局破坏。

---

# 47. Accessibility Principle

关键动作不能：

- 只依赖颜色；
- 只有 icon 无语义；
- 通过 hover 才能理解。

表单字段、错误和状态：

必须具有文本语义。

详细 WCAG implementation 属于后续 Design System / Verification，不在本文件冻结具体实现技术。

---

# 48. Design Non-goals

本次 Design Authority 不定义：

- CSS Framework
- Frontend Framework
- Component Library
- Exact Grid
- Exact Breakpoints
- Database Model
- API Endpoint
- Queue Architecture
- OAuth Backend Implementation
- Retry Algorithm
- Design Token values
- Detailed animation
- Final marketing copy

这些属于其他 Authority 或 Derived Specification。

---

# 49. Approved Material Design Decisions

以下 Product / UX Decisions 对 Approved Baseline Revision 1 生效。

- D-01、D-02、D-06 由 Approved Baseline 的既定语义归一化而来；
- D-03、D-04、D-05、D-07、D-08 及新增 D-09 ～ D-12 由 Human Owner 于 2026-08-20 明确批准。

## D-01

采用：

> One Content → Multiple Platform Versions

**Status: APPROVED — normalized from Approved Baseline Revision 1.**

---

## D-02

Approval 与 External Publish 是两个不同用户动作语义。

**Status: APPROVED — normalized from Approved Baseline Revision 1.**

---

## D-03

一次多平台 Confirmation 可以触发多个独立 Platform Executions；平台结果独立，不使用一个总状态掩盖 Partial Failure。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-04

每个 Content 使用一个主要 Content Detail 作为 Operational View，统一呈现版本、Approval、Publishing 和相关 Activity。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-05

Channel Connection / OAuth 由 Channels 统一拥有，不让各业务页面各自拥有独立授权体验。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-06

Disconnect Channel、Delete JINGTANG Data 和 Delete Third-party Content 是三个不同语义。

**Status: APPROVED — normalized from Approved Baseline Revision 1.**

---

## D-07

SaaS 一级 IA 采用：

```text
Home
Content
Approvals
Calendar
Channels
Activity
Settings
```

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-08

Create Flow 使用：

```text
Content
→ Platforms
→ Customize
→ Review
```

而不是每个平台建立独立 Create Flow。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-09

Entry and Setup Journey 使用：

```text
Sign Up / Login
→ Password Reset when needed
→ Create or Join Workspace
→ Invite Members
→ Assign Roles
→ Home
→ Connect
```

公开身份入口、Workspace Onboarding 与 `Settings → Members & Roles` 分别拥有身份、初始 Workspace 和持续团队管理责任。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-10

V1 Website IA 保留 `Solutions` 作为一级入口，同时继续受真实能力状态与禁止虚假宣传的上游约束。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-11

官网采用 mobile-first responsive；SaaS V1 优先 Desktop / Laptop operational experience，移动端至少保证状态可读且无严重布局破坏，不把完整复杂 Publishing Workflow 作为 V1 mobile target。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

## D-12

注册时由用户主动同意当前 Terms / Privacy；在第一次 YouTube Connect 或访问 YouTube API 功能前，若缺少适用同意或数据用途发生实质变化，必须先完成明确的 consent / re-consent，用户取消时不得启动 OAuth 或 API 操作。

**Status: APPROVED — Human Owner authorization, 2026-08-20.**

---

# 50. Design Readiness Boundary

以上 Material Decisions 已获批准，并与 Approved Baseline Revision 1 建立明确关系。

本 Delivery 的 Product / UX Target 可以重新进入正式：

> Design Readiness

Design Readiness 不要求：

- 所有高保真页面已经完成；
- 所有组件已经定义；
- Design System 已全部建立。

后续尚未完成的：

- Full-state screens
- Design System
- Figma details
- Responsive details
- Component specification

可以作为 Implementation Readiness Obligations 进入 PLAN，并在依赖它们的 UI Implementation Stage 之前完成。

---

# 51. Stop Condition

本 Approved UX Architecture 的编辑在以下条件达到后停止：

1. Material IA 已确定；
2. Core User Flow 已确定；
3. Screen Responsibility 已确定；
4. State Semantics 已确定；
5. D-01 ～ D-12 已由 Approved Baseline 归一化或得到 Human Owner 明确批准；
6. 没有已知 material UX ambiguity 阻止 Design Readiness。

满足以上条件后：

> 不继续为了“设计更完整”扩写本文。

下一步进入：

> **Design Readiness**
