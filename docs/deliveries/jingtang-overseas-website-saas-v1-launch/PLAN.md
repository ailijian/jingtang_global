# Implementation Plan

## Planning Preflight

Planning Preflight: PASS

Baseline Identity:

- Path: `docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md`
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Scope: project
- Status: Approved
- Baseline Revision: 2

PLAN:

- Path: `docs/deliveries/jingtang-overseas-website-saas-v1-launch/PLAN.md`
- Resolution source: Repository convention in `AGENTS.md`
- Mode: Revise

Current State: D0～D3 均已完成并获 Human Owner Stage Acceptance。D2 checkpoint `27c4729` 建立可运行的身份、Workspace、RBAC 与 canonical verification foundation；D3 production release `347f6b7` 已在 `https://jingtangai.com` 完成腾讯云首尔部署、DNS、HTTPS、双语 production smoke、Legal/Data Approval 与 Production Human E2E。下一 Stage 为 D4。

Authority readiness: 初始 Delivery Target 由 Approved Baseline 拥有；当前 Approved Design Target 可直接用于 planning。

Design Readiness: PASS；Approved Design Revision 1 继续拥有 material IA、flow 和 UX semantics；Approved Baseline Revision 2 新增的 English / 简体中文要求是跨界面的内容、响应式与持久偏好约束，不改变 D-01～D-12。其 Design-to-Build obligations 被放入 D0 的实现边界、独立 UI Finalization Stage D1 及各依赖 UI 实现 Stage，不另建 readiness receipt 或通用 readiness Gate。

Architecture Impact: Material；仓库尚无 Current Architecture / Domain / Contract Authority，D0 是唯一允许先建立这些 Owner 和必要 Human Decisions 的决策型 Stage。

Critical unknowns: None blocking plan generation。技术栈、部署区域、处理方、正式域名、唯一英文法律主体表达及生产平台账号访问均被路由为 D0 决策或后续显式外部依赖，不由 PLAN 预选答案。

Verification strategy: Ready；D2 必须先建立 canonical build、lint、type/static、unit、contract、migration、integration、E2E、安全与 CI 能力，之后的 Stage 只能引用这些真实机制。

Replanning: Required and completed；Human Owner 于 2026-08-20 批准 Baseline Revision 2 Amendment，新增官网与 SaaS 的 English / 简体中文要求。D0 已接受 checkpoint 保持有效，并仅补充 i18n 实现约束；尚未接受的 D1 package 升级为双语版本，D2～D7 增加 locale contract、实现与验证路由，不改变既有 Stage 顺序、平台边界或产品语义。

Proceeding to Plan Generation.

---

## Plan Identity

- Resolved PLAN path: `docs/deliveries/jingtang-overseas-website-saas-v1-launch/PLAN.md`
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Scope: project
- Baseline Revision: 2
- Baseline: `docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md`
- Baseline Status: Approved
- Plan mode: Revise
- Plan continuity: Preserve accepted D0 checkpoint `1f5b9f7`; D1-UI-R2 was accepted on 2026-08-20 and is preserved as the implementation-ready UI package

### Scope and Outcome

从初始仓库建立英文优先并完整提供简体中文的 JINGTANG 官网和首版多租户 B2B SaaS，使真实测试企业能够以任一界面语言完成 Workspace/RBAC、官方授权、用户自有素材、多平台版本、审批、明确发布、结果跟踪、审计、撤销和数据删除闭环；所有公开状态、法律披露、安全声明和开发者审核材料必须在两种语言中与实际生产能力一致并达到正式提交审核条件。

本 PLAN 以 YouTube 作为第一个真实生产渠道的执行顺序，因为当前 Baseline、Approved Design Target 与外部约束引用已覆盖其关键流程。该顺序不改变 Wave 1 产品边界，也不承诺 Facebook 与 Instagram 在 V1 同时 Available。若 YouTube 出现团队可控但无法满足 Baseline 的技术或政策阻断，必须停止相关 Stage 并重新 planning，不得静默将另一个平台加入范围。

### Non-goals

- 不建设 Baseline 已排除的通用自动化、Ads/CRM/DM/监听/Influencer/Full BI、高级 AI 视频生成或跨平台内容抓取搬运能力。
- 不把 Facebook、Instagram、TikTok、LinkedIn、Pinterest 或 X 的真实发布接入加入本 PLAN；这些平台保持与实际能力一致的 Coming Soon，除非未来 Baseline 或正式 replanning 明确纳入。
- 不以 AI Assistance 或 Schedule 作为关闭本 Delivery 的必要功能；未验证时保持不可用，若实现则必须满足对应条件型 AC。
- 不把第三方平台最终审批、配额扩展或 Compliance Audit 结果变成 Delivery Acceptance。
- 不在 PLAN 中预选技术栈、云厂商、持久化方案、队列实现或具体组件库；这些选择由 D0 建立的 Architecture Authority 拥有。

### Preserved Behavior and Constraints

- Approved Baseline 始终是 Goal、边界、Preserved Constraints 与 AC 的唯一 Owner；本 PLAN 只拥有执行顺序和验证。
- 外部写入、Schedule、授权、撤销和删除必须由有权用户明确触发；Approval 与 Publish 保持不同动作语义。
- 多租户隔离、RBAC、Token/Secret 保护、真实撤销和删除、审计、真实能力状态以及平台差异不得因统一 UI 或开发便利而弱化。
- 用户自有素材不得被自动添加 JINGTANG 水印、Logo、推广链接或未经确认的 AI 内容。
- English 为默认界面语言；English 与简体中文必须保持关键语义、能力状态、法律/Consent 和破坏性操作一致。语言切换不得丢失当前页面、Workspace、草稿或任务状态，用户创作内容不得被自动翻译。
- 未完成平台要求的 Verification / Audit 时，只执行当前政策允许的行为并显示真实限制；不得把审核中、私密限制或 Beta 能力标为 Available。

## Authoritative References

- `AGENTS.md` — 仓库知识地图、Authority 关系、Delivery workflow 与文档治理。
- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md` — Approved Delivery Target Revision 2；拥有 Goal、User Outcome、Non-goals、Key Decisions、Preserved Constraints 和 AC-01～AC-18。
- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md` — Approved Design Revision 1；拥有 material IA、screen responsibility、interaction、UX state、responsive 与 consent semantics。D1 必须在任何 UI 实现前消费其 D-01～D-12，并完成 full-state、高保真、Design System、响应式、可访问性和 handoff derived specifications。
- [Google OAuth 2.0 Production Policy Compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) — 实施与发布时的生产 OAuth 身份、域名、Homepage、最小 Scope 与验证外部约束。
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) — 实施与发布时的同意、用户控制、数据保留、撤销和删除外部约束。
- [YouTube `videos.insert` Reference](https://developers.google.com/youtube/v3/docs/videos/insert) — 上传 Contract、Scope 与未审核项目可见性限制的外部约束。

规划时不存在先前的 Product、Domain、Architecture、Contract、Security、Testing 或 CI Current Authority。D0～D2 将分别建立最小必要的 Architecture/Contract、UI derived specification 和 verification owner；任何新 Authority 都必须引用而不是复制 Baseline，且不能成为平行 Delivery Target。

## Documentation Delta

Update:

- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md` — Human Owner 授权 Revision 2 Amendment，新增官网与 SaaS English/简体中文要求和 AC-16；既有边界保持不变。
- `docs/architecture/README.md`、`docs/security-and-data/README.md`、`contracts/`、`config/integrations.yaml` — 保留 D0 Revision 1 决策并增加 locale/message/偏好/数据与能力状态 parity 约束。

Create:

- `docs/architecture/README.md` — D0 建立 Current Architecture Authority，拥有系统边界、运行/部署拓扑、数据与异步边界、身份与租户隔离、Secret/Token 边界、依赖和机器 Contract Owner；不得重述产品目标。
- `docs/security-and-data/README.md` — D0 建立安全与数据治理 Owner，D6 完成生产 Data Flow Map、Retention Matrix、区域/处理方/跨境、加密、撤销、删除和控制证据。
- `docs/OPERATIONS.md` — D6 建立生产操作 Owner，覆盖备份恢复、生产访问与记录、事件响应、漏洞管理、监控与外部平台故障处理。
- `contracts/` — D0 决定格式与 ownership，D2/D4 建立 Workspace、RBAC、Consent、Content、Platform Execution、Channel、Audit、API 和持久化迁移的 machine-readable contracts。
- `config/integrations.yaml` — D0 建立 canonical Integration Capability / Permission / Status Registry；D3/D5/D7 分别用它驱动公开状态、真实平台能力和发布时真相核验。

Generated:

- D1 UI source 中的双语高保真页面、prototype、full-state matrix、Design System、组件/Token、locale/glossary、响应式、可访问性和 annotated handoff — 由 Approved Design Target 与 Baseline Revision 2 双语约束派生并经 Human UI Final Approval 定稿，仍属于 derived specification，不替代或修改 Design Authority。
- API/schema reference、contract fixtures 与 migration evidence — 由 `contracts/` 和 D2 建立的 machine owners 生成。
- 网站 Integration status、适用的 reviewer instructions、permission-to-UI trace 和 review evidence bundle — 由 `config/integrations.yaml`、生产配置、Data Flow/Retention Owners 和验证结果在 D3/D5/D7 生成。

Unaffected:

- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md` — 保持 Human Owner 已授权的 Approved Revision 2；未经新 Amendment 授权不再修改。
- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md` — 保持 Approved Design Revision 1；实现只生成下游规格。
- `AGENTS.md` — 仓库治理明确要求未经授权不修改；本 PLAN 不安排治理改写。

## Implementation Delta

Current State 已有 accepted D0 Authorities 和完成 Human UI Final Approval/Stage Acceptance 的 D1-UI-R2 双语 build specification，但仍无应用实现、运行环境、已创建 machine schemas、测试或 CI。后续实现需要建立：可运行和可部署的双语官网/SaaS 基础；身份、locale preference、Workspace、多租户隔离和四类 RBAC；Source Asset、独立平台版本、审批与平台执行状态；真实 YouTube OAuth/发布/跟踪；审计、撤销、Token 与数据删除；生产数据、安全和运营控制；与实际能力同源的双语公开状态与开发者审核证据。

实现必须维持清晰的 Domain 与 Platform Execution 分离，不能以 mock 授权、mock 发布、人工改库或统一总状态证明最终闭环。Facebook、Instagram 和后续平台在本 PLAN 中只作为真实 Coming Soon 状态，不建立适配器或预申请权限。

## Stage Progression

- 只有当前 Stage 的全部 Required Verification 与 Required Gates 通过后，才具备创建 Git checkpoint 的资格。
- 下一 Stage 从最近一个已接受 checkpoint 开始。
- 非阻塞异步检查不能替代阻塞 Gate。
- 本 PLAN 不提交、不推送、不创建 checkpoint、不记录 Stage Acceptance，也不推进任何 Stage 状态。
- 执行时一次只开展一个 Stage；发现 Baseline 冲突、外部政策使目标不可达或需要新增产品含义时立即停止并路由到相应 Authority/workflow。

## Stage Overview

| Stage | Outcome | Depends on | Key checkpoint |
| --- | --- | --- | --- |
| D0 | 建立架构、数据、安全、Contract 与平台执行前提的 Authority | None | Human-owned decisions complete |
| D1 | 独立完成 UI Design、Design System、全状态与最终定稿 | D0 | Human UI Final Approval |
| D2 | 可运行的身份、Workspace、RBAC 与 verification foundation | D0, D1 | First runnable Human E2E |
| D3 | 官网在正式验证域名先行 Production Launch | D1, D2 | Official website production checkpoint |
| D4 | Source Asset、平台版本和审批核心闭环 | D2, D3 consent/legal surfaces | Pre-publish Human E2E |
| D5 | YouTube 真实 OAuth → Publish → Track protected integration slice | D3 production website, D4, external platform readiness | Actual API integration Human E2E |
| D6 | Revoke/Delete/Audit、Retention、安全和运营闭环 | D5 | Trust-boundary acceptance |
| D7 | SaaS production/reviewer launch、审核就绪、全量 E2E 与关闭 | D3, D6 | Blocking full regression and final acceptance |

D1 先完成不改变 material UX semantics 的独立 UI 定稿。第一条可运行纵向切片在 D2：真实用户完成 Register → Workspace → Invite → Assign Role。D3 将官网独立上线到正式验证域名，D5 才进入真实外部平台纵向切片。Human E2E 安排在 D2～D7 的体验关键边界；全量回归只在 D7 阻塞执行。

## D0 — Authority, Architecture, and External Readiness Decisions

Goal:

在不编写产品实现的前提下，建立后续 Stage 必须依赖的 Current Architecture、机器 Contract、安全/数据与 Integration Registry Owner，并获得所有会改变实现方向的 Human Decisions。

Authoritative References:

- Approved Baseline Revision 2：全部 Key Decisions、Preserved Constraints 与 AC；Revision 2 新增的双语约束不得改变 Revision 1 已接受的 D0 产品/平台边界。
- Approved Design Revision 1：D-01～D-12 及 planning obligations。
- 当前 Google OAuth、YouTube Developer Policies 与 `videos.insert` 官方来源。
- `AGENTS.md`：Authority 与文档治理。

Deliverables:

- 创建并由 Human Owner 批准 `docs/architecture/README.md`，确定但不限于：应用/模块边界、技术栈、部署与环境、区域、身份、租户边界、持久化、对象存储、异步平台执行、Secret/Token 管理、可观测性、Contract 与 migration ownership。
- 创建 `docs/security-and-data/README.md` 的初始 Data Flow Map 与 Retention Matrix；解决会影响架构的区域、处理方、跨境、加密、备份和删除路径，不把产品文案当作数据流证据。
- 定义 `contracts/` 的格式、owner 和兼容/迁移规则，覆盖 Workspace/RBAC、Consent、Content Lifecycle、Publishing Intent、Platform Execution、Channel State 与 Audit Event。
- 创建 `config/integrations.yaml`，以 YouTube 为首个执行渠道，记录实际 Capability、Publish/Schedule 状态、最小 Scope、当前 review/audit 限制与公开 Status；Facebook、Instagram 与 Wave 2 平台保持真实 Coming Soon。
- 记录官方主域名、域名邮箱、唯一英文法律主体表达的 Human Owner 与冻结入口；记录 DNS、生产环境、Google Cloud/YouTube Developer Project、支持联系人和凭据访问的责任人，不把 Secret 写入仓库。
- 为 D2 选定 canonical repository verification 与 CI 机制的实现位置；不在本 Stage 伪造尚不存在的命令。
- 将 full-state screens、UI states、Design System、组件、响应式、可访问性和 annotated handoff 路由到独立 D1；将 Consent Version/Timestamp machine contract 路由到 D2。

Non-goals:

- 不创建产品代码、数据库、云资源、Developer App 配置或生产状态。
- 不提交任何第三方审核，不选择 Baseline 未授权的额外平台或产品能力。
- 不把技术偏好写成 Product Authority。

Affected Surface:

- `docs/architecture/README.md`
- `docs/security-and-data/README.md`
- `contracts/`
- `config/integrations.yaml`
- external account/domain readiness records referenced by these owners

Architecture Impact:

- Unresolved — decision-only Stage，用于建立初始项目缺失但后续实现必须依赖的 Architecture、Domain/Contract、Security/Data Authority 与 Human Decisions。
- Structural Enforcement: Not required；本 Stage 只建立明确 Owner、边界和后续 enforcement obligations。

Review Need:

- Authority/human decision required — Human Owner 必须确认技术/部署/区域/处理方选择、官方身份与 YouTube 首个执行路线不改变 Approved Baseline。

Dependencies:

- None

Risk:

- Level: Normal
- Rationale: 不改变运行状态，但错误的基础决策会影响所有后续 Stage；通过决策型 Stop Condition 隔离风险。

Verification Scope:

- Profile: Targeted
- Rationale: 只需验证 Authority 图、决策完整性、外部约束可追溯性和后续可执行性。

Required Verification:

- Authority completeness evidence：每个 material fact 有唯一 Owner，新文档声明 ownership、依赖和非 ownership，且不复制或改写 Baseline AC。
- Decision completeness evidence：D1～D4 所需的架构/数据/Contract 决策无阻塞 TBD；D5 所需外部账号、域名和政策条件要么已有证据，要么被明确标为 D5 前置依赖及 owner。
- Policy trace evidence：YouTube 每个拟申请 Scope 都能追溯到 Baseline 功能、Approved UI 与用户动作；Schedule 默认为 Not Available，除非能力和恢复语义已验证。
- Design obligation routing check：Approved Design D-01～D-12 与全部 Design Readiness obligations 由 D1 统一接收，并能追溯到 D2～D5 的实现 surface。

Asynchronous CI:

- Workflow: None
- Blocking for Stage Progression: Not applicable

Required Gates:

- Self Verification
- Authority/human decision required

Stop Condition:

- D0 新建 Authority 已获 Human Owner 确认，D1～D4 不再依赖未决架构选择；所有 D5 外部依赖有可验证 owner 和明确 Gate，且没有新产品含义或 Baseline conflict。

## D1 — UI Design, Design System, and Finalization

Goal:

在任何 UI 实现开始前，将 Approved Design Revision 1 与 Baseline Revision 2 的双语约束派生为完整、可审阅、可构建的官网与 SaaS UI package，并通过 Human UI Final Approval 定稿。

Authoritative References:

- Approved Baseline Revision 2：用户结果、边界、truthful status、角色、显式用户控制、English / 简体中文与全部 UI 相关 AC。
- `docs/deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md`：D-01～D-12、IA、screen responsibility、interaction、state、responsive、accessibility 与 consent semantics。
- D0-approved `docs/architecture/README.md`：只提供实现约束、运行边界和技术可行性输入，不拥有产品或 UX 意义。

Deliverables:

- 在 Figma 或等价可审阅 UI source 中完成官网全部要求页面及 SaaS Home、Content、Approvals、Calendar、Channels、Activity、Settings、身份/Onboarding 与 Workspace/Team surfaces 的高保真设计。
- 为官网与 SaaS 定稿 English（`en`）/简体中文（`zh-CN`）双语 UI：英文默认；官网 public header 与 SaaS account/settings 提供明确语言切换；切换保留当前 route、Workspace、草稿和任务上下文；未登录与已登录偏好分别有明确持久化规则。
- 建立可实现的 localization handoff：locale/message key ownership、canonical glossary、品牌/平台/法律主体不翻译规则、数字/日期/时区格式、fallback、缺失翻译处理、官网 localized route/metadata/`hreflang` 规则，以及用户创作内容不自动翻译的边界。
- 建立并定稿 Design System：color、typography、spacing、grid、radius、elevation、icon、motion 原则，以及 navigation、form、table/list、status、tabs、upload、preview、modal/dialog、toast、empty/loading/error 等组件与 Token；具体实现技术仍由 Architecture/implementation owner 决定。
- 为简体中文补充匹配品牌气质的中文字体、字号/行高、标点与无强制字距规则，并验证中英文文本扩展、换行、按钮、表格、状态标签、dialog 和 320px reflow。
- 建立 full-state matrix，至少覆盖 empty、loading、success、validation error、upload failure、authorization expiry、reauthorization、publishing/processing/partial failure、Needs Attention、disconnecting、deletion、permission denied、disabled-with-reason 和 destructive confirmation。
- 完成关键 prototype：Sign Up/Login → Workspace setup；Upload → Platforms → Customize → Preview → Submit → Approve/Reject；Connect/Consent/Reauthorize；Confirm Publish → Track；Disconnect/Revoke/Delete。
- 定稿 website mobile-first 与 SaaS desktop/laptop-first、mobile-readable 的 responsive layouts；定义 keyboard、focus、contrast、文本化状态/错误、非颜色单一提示和可访问名称等 build requirements。
- 定稿官网与产品的 capability/status 表达，包括 Available、Beta / Early Access、Coming Soon、Schedule Not Available、AI Visibility Services/Early Access；prototype 与 mock data 必须明确为设计内容，不能成为生产能力证据。
- 形成可追溯 handoff package：screen/component inventory、state matrix、interaction annotations、双语 copy/message slots 与 glossary、asset export、responsive rules、accessibility notes、版本/链接与 Baseline/Design decision mapping。
- 记录 Human UI Final Approval 的批准对象和版本。批准只确认 derived package 忠实、完整且 build-ready，不把它提升为平行 Product/Design Authority。

Non-goals:

- 不修改 D-01～D-12，不新增一级 IA、关键 flow、screen responsibility、产品能力、平台或 consent/recovery semantics。
- 不编写产品实现、API/schema、数据库、CI 或生产配置。
- 不用高保真程度、prototype 或 mock data 声称功能已经实现或 Available。

Affected Surface:

- Figma or equivalent reviewable UI source
- Design System and component/token specification
- full-state, responsive, accessibility and interaction annotations
- implementation handoff package

Architecture Impact:

- None — 本 Stage 只派生并定稿 UI specification，不改变模块、持久化、Contract、安全或部署边界。
- Structural Enforcement: Not required

Review Need:

- Authority/human decision required — Human Owner 对指定 UI package/version 做 Final Approval；如发现任何 material UX/Product choice，必须停止并显式重新调用 design-readiness，而不是在本 Stage 内批准。

Dependencies:

- D0 accepted checkpoint

Risk:

- Level: Normal
- Rationale: 设计定稿影响全部用户可见实现和返工成本，但尚未改变运行状态，且 material semantics 已由 Approved Design Authority 约束。

Verification Scope:

- Profile: Targeted
- Rationale: 只验证 UI package 对 Approved Baseline/Design 的 fidelity、完整性、可访问性/响应式覆盖和 build handoff readiness。

Required Verification:

- Screen/state coverage matrix 将全部 Approved IA、关键 flow、角色、平台状态、consent、error/recovery 与 destructive actions 映射到明确 screen/component；无未归属 material state。
- Baseline/Design trace review 证明每个关键 prototype 和 primary action 来自 Approved Authority，未引入额外平台、Schedule、AI、自动发布或虚假 Available 能力。
- Responsive/accessibility review 覆盖 English 与简体中文的 website mobile-first、SaaS desktop-first/mobile-readable、keyboard/focus、contrast、文本状态、非颜色单一提示、文本扩展和 320px 无阻断性截断/溢出。
- Localization coverage review 证明全部 in-scope 页面、关键 flow、状态、错误、Consent、法律/安全与 destructive action 均有 `en`/`zh-CN` message ownership；capability/Integration machine values 通过单一 reviewed catalog 映射，不产生语言相关的能力漂移。
- Prototype language-switch walkthrough 证明 English 默认、切换和偏好语义明确，当前 route/Workspace/草稿/任务不丢失，用户创作内容不自动翻译，缺失翻译采用安全英文 fallback 并在验证中失败而非静默发布。
- Design System/component coverage review 证明重复 UI pattern 有一致 specification，平台特定字段和能力差异没有被统一组件掩盖。
- Human walkthrough 完成 onboarding、content approval、YouTube consent/connect/publish、failure recovery 和 disconnect/delete prototypes；所有 blocking comments 在批准版本关闭。
- Handoff inspection 证明最终版本、链接、annotations、assets、双语 copy/message slots、glossary 和 state/component mapping 对 D2～D5 可访问且无 blocking TBD。

Asynchronous CI:

- Workflow: None
- Blocking for Stage Progression: Not applicable

Required Gates:

- Self Verification
- UI Design Final Approval — Human Owner 明确批准指定版本的 UI package 作为 implementation-ready derived specification。
- Stage Acceptance

Stop Condition:

- 官网与 SaaS 全部 in-scope screens、English/简体中文 copy/state、full states、Design System、responsive/accessibility、localization 与 handoff 已在唯一指定版本定稿并获 Human UI Final Approval；不存在未决 material UX choice、Authority conflict 或会阻塞 D2～D5 的 UI TBD。

### D1 Acceptance Record

- Status: Accepted
- Accepted package: `D1-UI-R2`
- Human UI Final Approval: JINGTANG Human Owner 于 2026-08-20 明确批准“批准 D1-UI-R2 并接受 D1 Stage”。
- Stage Acceptance: Accepted by the same Human Owner instruction.
- Self Verification: package/version/authority trace、AC-16/PLAN coverage、YAML、local links、HTML/JavaScript、English/简体中文 runtime switching、locale preference、state preservation、user-content preservation、critical destructive copy、320px no-overflow 与 final diff checks 均通过。
- Code Review: Not required by the D1 PLAN Gate set；本 Stage 只交付 derived UI specification，没有产品实现代码。
- Checkpoint: created by the repository workflow immediately after this acceptance record; Git history owns the checkpoint identity.

## D2 — Runnable Foundation, Identity, Workspace, and Verification

Goal:

建立最小可运行、可迁移、可测试和可部署的应用基础，并让真实用户完成身份、Workspace、邀请和角色分配的第一条 Human E2E。

Authoritative References:

- Baseline：AC-04、AC-05、AC-11、AC-12、AC-13、AC-16 及多租户/RBAC/Secret/双语约束。
- Approved Design：Primary SaaS IA、Onboarding and Team Setup、D-07、D-09、D-11、D-12。
- D1-finalized UI package：身份、Onboarding、SaaS shell、full states、responsive、accessibility 与 component handoff。
- D0-approved `docs/architecture/README.md`、`docs/security-and-data/README.md` 与 `contracts/` ownership。

Deliverables:

- 建立 D0 所选架构下的最小 runnable application、数据库/migration、环境配置和本地/CI 启动路径；测试、开发和生产配置保持隔离。
- 建立 canonical format、lint、type/static、build、unit、contract、migration、integration、E2E、安全/secret scan 命令，并由阻塞 CI 执行；命令必须由实际项目脚本和 CI machine config 拥有。
- 建立共享 i18n 基础：受版本控制的 `en`/`zh-CN` message catalog、English 安全 fallback、locale-aware 日期/数字/时区格式、缺失/未使用 key 检查，以及 SSR/CSR hydration 一致的 locale resolution。
- 在用户/会话 contract 中实现 `en`/`zh-CN` locale preference；已登录用户偏好跨设备持久化，未登录偏好局部持久化，切换语言保留当前 route、Workspace 与表单/草稿状态。Consent 记录引用同一 canonical policy version，并保留用户看到的 locale。
- 实现 Sign Up、Login、Logout、Password Reset 或等价恢复，记录当前 Terms/Privacy consent version 与 timestamp；链接和最终文案由 D3 提供。
- 实现 Create/Join Workspace、Invite/Remove Member、Assign/Change Role、当前 Workspace 选择和 Owner/Admin、Editor、Approver/Publisher、Viewer 基础权限。
- 在数据访问层和服务边界实际执行 tenant isolation 与 deny-by-default RBAC；建立 Audit Event 基础设施，至少覆盖本 Stage 已存在的身份、成员与角色操作。
- 按 D1-finalized UI package 实现 auth/onboarding、一级导航、empty/loading/error、responsive/accessibility 与 SaaS desktop-first/mobile-readable 基础壳层；不得在代码中重新设计 material flow。
- 建立 machine contract compatibility、migration rollback/forward、tenant isolation、RBAC 和 consent record 测试能力。

Non-goals:

- 不实现 Content、Approval、Channel OAuth 或外部发布。
- 不完成生产法律文案、安全声明或第三方 Developer App 配置。

Affected Surface:

- application and infrastructure scaffold selected by D0
- identity/session, Workspace, member and role modules
- database/migrations and `contracts/`
- UI shell consuming the D1-finalized derived specification
- test harness and CI workflows

Architecture Impact:

- Material — D0 Architecture Authority 所定义的应用、身份、租户、持久化、migration 和 CI 边界；Baseline 要求真实多租户隔离、四类 RBAC、环境隔离与 Secret 防泄漏。
- Structural Enforcement: 建立并由 CI 阻塞执行 tenant-bound data access、RBAC deny matrix、contract compatibility、migration 和 secret scan 的最小自动化检查。

Review Need:

- Code Review — 聚焦身份/session 安全、tenant isolation、RBAC deny path、migration 安全和 Secret/PII 日志边界。

Dependencies:

- D0 and D1 accepted checkpoints

Risk:

- Level: High
- Rationale: 身份、租户和持久化基础错误会造成跨租户数据或权限泄漏，并影响所有后续 Stage。

Verification Scope:

- Profile: Affected Integration
- Rationale: 需要同时验证 identity、database、RBAC、UI onboarding 与新建 CI/contract 边界，但尚不需要全仓库回归。

Required Verification:

- 运行 D2 创建的 canonical format、lint、type/static、build、unit、contract、migration 和 secret scan 命令，全部通过。
- 运行 tenant isolation 与四类 RBAC allow/deny integration matrix，证明跨 Workspace 访问被拒绝且 Viewer 无写权限。
- 运行 migration 在空库和前一 schema 状态上的 forward/rollback 或 D0 Authority 指定的安全替代证据。
- 运行 auth/workspace E2E：Register → current Terms/Privacy consent record → Login/Logout/Reset → Create or Join Workspace → Invite → Assign Role。
- 运行 `en`/`zh-CN` catalog completeness、fallback、SSR/hydration 与 locale-preference contract/integration tests；分别以两种语言执行身份、Consent、Workspace 与角色关键路径，验证切换不丢失当前任务或用户输入。
- 运行 UI fidelity check，证明实现覆盖 D1-finalized auth/onboarding states、keyboard/focus、文本化错误/状态和 SaaS mobile-readable 基础边界；发现 material deviation 时停止并回到 Design Authority，而不是在代码中决定。

Asynchronous CI:

- Workflow: D2-created canonical pull-request CI
- Blocking for Stage Progression: Yes

Required Gates:

- Self Verification
- Code Review
- Human E2E
- Stage Acceptance

Stop Condition:

- 新 clone/clean environment 能按 canonical path 启动和验证；真实用户无需人工改库即可按 D1 定稿流程完成身份与 Workspace/团队设置；tenant/RBAC 负向证据、CI、machine contracts 和 UI fidelity 全部阻塞通过。

### D2 Acceptance Record

- Status: Accepted
- Stage Acceptance: JINGTANG Human Owner 于 2026-08-21 明确批准“批准 D2 Stage Acceptance，并创建 checkpoint”。
- Self Verification: canonical format、lint、type/static、build、unit、contract、i18n、migration/RLS、integration、platform E2E、security/secret scan 与 production dependency audit 均通过。
- Code Review: identity/session、tenant isolation、RBAC deny path、migration 与 Secret/PII 边界完成评审，无 blocking finding。
- Human E2E: Register/Workspace、双语输入保留、Consent 默认未勾选、邀请/接受/双向 Workspace 切换、Viewer deny、最后 Owner 保护、全部角色切换、成员移除与安全回退、Logout、密码重置、locale/Workspace 恢复均通过；320px 导航可见性作为非阻塞观察被 Human Owner 接受。
- Checkpoint: `27c4729` (`feat: establish D2 platform foundation`).

## D3 — Official Website Production Launch, Legal Surfaces, and Truthful Capability Status

Goal:

在 YouTube OAuth verification/audit 路径之前，将英文默认、完整提供简体中文且 mobile-first 的官网与法律/信任页面独立部署到已验证的官方生产域名，并让两种语言中的所有产品和 Integration 状态从 canonical registry 反映当前真实能力。

Authoritative References:

- Baseline：AC-01、AC-02、AC-03、AC-12、AC-13、AC-16 及品牌、法律主体、双语和 truthful claims 约束。
- Approved Design：Website Experience Architecture、Website IA、Integration Page、Coming Soon、Visual/Responsive/Accessibility principles、D-10、D-11、D-12。
- D1-finalized UI package：官网高保真页面、Design System、full states、mobile-first、accessibility 与 handoff。
- D0/D2：`config/integrations.yaml`、`docs/security-and-data/README.md`、实际 UI/contract owners。

Deliverables:

- 按 D1-finalized UI package 为 English 与简体中文实现 Home、Social Publishing、Workflow & Approvals、Integrations、每个标为可用的 Integration 详情、Solutions、About、Contact、Security、Privacy、Terms 和 Data Deletion 页面；英文为默认语言。
- 为每个 public page 提供稳定的 locale route，并生成正确的 canonical、language alternate/`hreflang`、`lang`、localized metadata、sitemap 与同语言内部链接；语言切换保持对应页面，不将用户送回首页。
- 实现 `Book a Demo` 主 CTA、Sign In 和可验证的 Contact/Demo 提交或明确联系路径，不提供空占位站。
- 由 `config/integrations.yaml` 驱动 Available、Beta / Early Access、Coming Soon、Publish Now、Schedule Supported/Not Available 和 Integration action visibility；Coming Soon 无 Connect/Publish/假截图。
- 在两种语言中清楚区分 SaaS Product、Professional Services 与 AI Visibility Early Access/Services；不宣称客户、Partner、认证或未验证安全能力。
- 冻结并一致显示 Human Owner 确认的品牌、主域名/域名邮箱和唯一英文法律主体表达；开发/预览环境不得伪装为正式域名。
- 以两种语言实现可直接访问的 Privacy、Terms、Data Deletion 和 Security；内容必须引用同一 canonical policy version，映射 D0 当前 Data Flow/Retention 与已验证控制，并保留 D6/D7 的生产定案义务。
- 将注册和 YouTube consent/re-consent 流程需要的 current policy URLs/version 接入 machine contract；选项不得预勾选。
- 经 Production Change Authorization 后，将官网部署到 D0-approved official production domain，启用 HTTPS，完成域名所有权验证所需配置，并保证 Home、Privacy、Terms、Data Deletion、Security、Contact 与 Integration pages 无登录即可公开访问。
- 验证官网域名、Privacy/Terms URL、OAuth authorized domain、支持邮箱和法律主体能够作为后续 Google brand verification 与 YouTube review 的一致输入；本 Stage 不声称审核已经通过。
- 按 D1 定稿完成两种语言的网站 full-state、mobile-first、keyboard、focus、form error、link integrity、文本扩展/换行和基础可访问性实现。

Non-goals:

- 不模拟 SaaS 功能、不展示虚假产品截图、不实现未进入当前 Stage 的 Integration。
- 不宣称尚未验证的认证、区域、备份、加密或平台批准状态。
- 不把 SaaS 面向所有客户 GA 作为官网上线前提；SaaS 入口只显示当前真实 Private Beta/Coming Soon/Sign In 状态。
- 不提交 Developer Review。

Affected Surface:

- public website and legal/trust routes
- official production domain, HTTPS, DNS and website deployment configuration
- capability/status registry consumption
- public forms and identity links
- generated Integration status and review-facing pages

Architecture Impact:

- Material — D0 Architecture Authority 的 public application、official domain/HTTPS deployment、configuration 和 form/data boundary；Baseline 要求所有公开状态和声明与生产事实一致。
- Structural Enforcement: registry schema validation、production route/HTTPS/CTA/link crawl、status-to-action contract tests，以及禁止 Coming Soon executable actions 的自动化检查。

Review Need:

- Code Review — 聚焦 production website configuration、form/data handling、status gating、security headers、Secret exposure 与 D1 UI fidelity；claims/法律内容由下列 Human Gates 判断。

Dependencies:

- D1 and D2 accepted checkpoints
- D0 Human Owner 已确认品牌、主域名 owner、域名邮箱 owner 与唯一英文法律主体表达
- Production Change Authorization before DNS, domain verification or website deployment writes

Risk:

- Level: High
- Rationale: 本 Stage 首次改变正式域名和公开生产状态；主要风险是公开误导、法律披露、表单数据、DNS/HTTPS 与能力状态漂移，但尚不执行外部社交写入。

Verification Scope:

- Profile: Affected Integration
- Rationale: 需要跨 website routes、registry、forms、identity consent links 与 responsive/accessibility 行为验证。

Required Verification:

- 运行 D2 canonical lint、type/static、build、targeted unit/integration 与 website E2E。
- 运行 official production domain 的 HTTPS、route/link/status crawl：Baseline 要求页面无需登录公开可达，主 CTA 可用，Coming Soon 无 executable action，所有 Available/Beta 状态有 registry 证据。
- 对 `en`/`zh-CN` 分别运行 route/metadata/`lang`/canonical/`hreflang`/sitemap/link crawl 与 translation completeness 检查；每个页面的语言切换保持对应 route，缺失 locale 页面阻断发布。
- 运行 mobile viewport、keyboard/focus、form validation、文本状态与基础 accessibility 自动化检查，并进行关键页面 Human E2E。
- 运行 D1 UI fidelity review，验证 production website 与最终定稿页面、states、responsive 和 component rules 一致，无实现阶段新增的 material UX。
- 运行双语语义 parity 与 visual regression：重点核对 capability/Integration 状态、法律主体、Privacy/Terms/Data Deletion/Security、Consent、错误和破坏性语义，并在 320/390/768/1024/1440px 验证中文无阻断性截断或溢出。
- 人工逐项比对品牌/法律主体/域名、产品与 Services、AI Visibility、Integration 和 Security claims 与当前 registry、Data Flow 和已验证控制。
- 验证 official domain ownership、Privacy/Terms 同域公开 URL、support email、OAuth authorized-domain inputs 和 production website identity 一致，可作为后续 verification/audit 输入。

Asynchronous CI:

- Workflow: D2-established canonical CI
- Blocking for Stage Progression: Yes

Required Gates:

- Self Verification
- Code Review
- Production Change Authorization — Human Owner 明确授权 DNS、域名验证、官网 production deployment 与公开 rollout。
- Human E2E
- Legal/Data Disclosure Approval — Human Owner 确认当前 Terms、Privacy、Data Deletion 与 D0 Data Flow/Retention 一致后，才可作为生产/审核证据。
- Stage Acceptance

Stop Condition:

- 官网 English 与简体中文页面已在已验证的官方生产域名通过 HTTPS 无登录公开可达；所有要求页面、locale routes/alternates、CTA、表单、法律链接和状态通过 production smoke、双语 parity 与 D1 fidelity review；该域名/法律身份可供后续 OAuth/YouTube review 使用，且不存在无事实支撑的 Available、客户/Partner、认证或安全声明。

### D3 Acceptance Record

- Status: Accepted
- Stage Acceptance: JINGTANG Human Owner 于 2026-08-21 明确批准“Production Human E2E 通过，批准 D3 Stage Acceptance 并创建 checkpoint”。
- Production Change Authorization: Human Owner 明确授权 `jingtangai.com` 的 DNS、证书、腾讯云 production deployment、公开 rollout、production-candidate commit 与 push。
- Legal/Data Disclosure Approval: Human Owner 明确批准更新后的中英双语披露，覆盖腾讯云首尔轻量应用服务器、GoDaddy DNS、Let's Encrypt ACME、有限安全/访问日志，以及官网不处理账号数据、用户内容、OAuth Token 或应用 Secret 的边界。
- Self Verification: final `pnpm verify`、production release check、33-page static build、28-route bilingual candidate checks、platform E2E 4/4、website E2E 6/6、secret scan 与 production dependency audit 均通过。
- Code Review: production configuration、email-handoff data boundary、registry/status gating、Caddy security headers、immutable release/rollback、dedicated SSH deployment、pinned container image、Secret exposure 与 D1 UI fidelity 完成评审，无 blocking finding。
- Production Evidence: production release `347f6b72ee0704e67840b205da3e706ad88f7703` 已部署到腾讯云首尔实例；Cloudflare 与 Google public DNS 均解析至受控生产主机；HTTP 正确 `308` 跳转 HTTPS；Let's Encrypt `jingtangai.com` 证书已签发；17 个公开 HTTPS production routes、双语 `lang`、法律版本、Integration truth 与安全响应头 smoke 全部通过；Caddy 容器持续运行。
- Human E2E: Human Owner 完成并通过 production website 中英文首页/切换、法律与信任页面、Contact/Book Demo 邮件交接和移动端检查。
- Checkpoint: created by the repository workflow immediately after this acceptance record; Git history owns the checkpoint identity.

## D4 — Content, Platform Versions, and Approval Core

Goal:

在不调用外部发布 API 的前提下，建立 Source Asset → Platform Versions → Customize → Preview → Submit → Approve/Reject 的真实持久化闭环。

Authoritative References:

- Baseline：AC-05、AC-06、AC-08、AC-11、AC-16、AC-17；内容、角色、状态、用户控制、双语与用户自有素材约束。
- Approved Design：D-01～D-04、D-07、D-08；Create/Review、Approval、Content Detail、state/error/role-sensitive UX。
- D1-finalized UI package：Composer、Content Detail、Approvals、Calendar、Activity、role-sensitive actions、full states 与 responsive/accessibility handoff。
- D0/D2 machine contracts：Content Lifecycle、Publishing Intent、Platform Execution、RBAC、Audit 与 Integration Capability。

Deliverables:

- 实现用户自有 Source Asset 上传、真实对象存储、上传状态与失败阻断；不抓取第三方内容，不自动加 JINGTANG 标识或宣传文本。
- 界面语言只影响 JINGTANG UI、系统提示和格式化；Source Asset、Title、Description、Caption、评论和其他用户创作内容保持用户原文，切换 locale 不自动翻译或改写。
- 实现 One Content → independently editable Platform Versions，用户主动选择具体平台和账号占位/已连接账号，未选择平台不产生版本或写入意图。
- 实现单一 Composer：Content → Platforms → Customize → Review；平台字段由 capability contract 决定，不伪造相同字段。
- 实现 Draft、Pending Approval、Rejected、Approved 及必要 Publishing Intent/Platform Execution 分离；状态转换由 machine contract 和 RBAC 共同执行。
- 实现 Editor Submit、Approver/Publisher Approve/Reject、Reject reason 和独立 Publish Confirmation 前置状态；Approval 不触发外部写入。
- 实现 Content Detail 的 Overview、Platform Versions、Approval、Publishing placeholder/status 和相关 Activity single operational view。
- AI Assistance 默认关闭；若本 Stage 实现任何 AI 建议，则必须可查看、修改、删除、拒绝且不能绕过最终确认，并增加对应数据流/测试。
- Schedule 默认 Not Available；不得因 Calendar 或统一 Composer 建立未经验证的时间能力。
- 按 D1-finalized UI package 实现 Content/Approval 的 full-state、permission、empty/loading/error、desktop-first/mobile-readable、keyboard/focus 与可访问性；不得在代码中重新设计 approved flow。

Non-goals:

- 不连接真实平台、不启动 OAuth、不执行 Publish/Schedule。
- 不实现复杂多人会签、Agency 多客户管理或 Baseline 排除的自动化能力。

Affected Surface:

- asset storage/upload
- Content and Platform Version domain/persistence
- approval workflow and RBAC
- Content/Approvals/Calendar/Activity UI
- audit events and machine contracts

Architecture Impact:

- Material — D0/D2 Architecture 与 machine contract 所定义的持久化、对象存储、RBAC、状态转换和 Audit boundary；Approved Target 要求 Content、Publishing Intent 与各平台 Execution 语义分离。
- Structural Enforcement: contract/state-transition tests、RBAC allow/deny matrix、tenant isolation tests、asset integrity checks 与禁止 Approval 触发外部 adapter 的结构检查。

Review Need:

- Code Review — 聚焦状态机与事务边界、跨租户/角色授权、对象存储访问、Approval/Publish 分离和 Audit 完整性。

Dependencies:

- D2 accepted checkpoint
- D3 current Terms/Privacy URLs and consent version available to the application

Risk:

- Level: Normal
- Rationale: 新增核心持久化和权限流程，但尚无外部平台写入；风险可通过状态/权限/tenant 负向测试局部控制。

Verification Scope:

- Profile: Affected Integration
- Rationale: 需要跨 storage、domain、database、RBAC、audit 和多页面 UX 验证完整 pre-publish journey。

Required Verification:

- 运行 D2 canonical lint、type/static、build、unit、contract、migration 和 targeted integration commands。
- 运行 Content/Platform Version 状态转换、RBAC、tenant isolation、upload failure、asset ownership constraint 与 Audit event matrix。
- 运行负向测试：未选平台不产生版本；Viewer/Editor 无 Publish；Approval 不调用 adapter；Failed upload 不能继续；AI/Schedule 未验证时无可执行入口。
- Human E2E：分别以 English 和简体中文完成 Upload user-owned content → Select platform/account → Customize independent version → Preview → Submit → Approve/Reject → inspect Content Detail/Activity；切换语言保持 draft/revision/context 和原始创作内容，且全程没有外部写入。
- 运行 D1 UI fidelity review，验证桌面主流程、移动端状态可读、keyboard/focus、错误恢复、platform-specific fields 和 role-sensitive primary actions 与定稿版本一致。

Asynchronous CI:

- Workflow: D2-established canonical CI
- Blocking for Stage Progression: Yes

Required Gates:

- Self Verification
- Code Review
- Human E2E
- Stage Acceptance

Stop Condition:

- 真实数据库与对象存储上的 pre-publish journey 无需 mock 或人工改库即可完成；角色、tenant、状态和 Audit 负向证据通过；没有外部平台写入或未授权 AI/Schedule 能力。

## D5 — YouTube OAuth, Publish, and Track Protected Integration Slice

Goal:

在受保护的 production-equivalent integration environment 中，以实际 Google/YouTube Developer Project、真实授权账号和真实 API 建立 Connect → Customize → Confirm → Publish → Track vertical slice，同时准确执行当前审核/可见性限制；D7 唯一拥有 SaaS production/reviewer launch 与生产 AC 证明。

Authoritative References:

- Baseline：AC-03、AC-05、AC-07、AC-08、AC-09、AC-15、AC-16 及官方授权、最小 Scope、显式用户控制、双语和平台差异约束。
- Approved Design：D-02、D-03、D-05、D-12；Channels、Consent、Connect/Reauthorize、Publish Confirmation、independent Platform Execution 和 result/error UX。
- D1-finalized UI package：Channels、Consent/Re-consent、YouTube fields、Publish Confirmation、result/failure/recovery 与 responsive/accessibility handoff。
- Google OAuth、YouTube Developer Policies、YouTube `videos.insert` 的执行时当前官方版本。
- D0～D4：Architecture、Security/Data、contracts、Integration Registry、Content/Approval owners。

Deliverables:

- 按 D0 Architecture 和执行时 Google policy 使用隔离的 testing/integration 与 production project/config；在受保护 integration environment 配置 production-equivalent Google OAuth，使用当前功能所需的最小 Scope，不获取平台密码/Cookie，Token 加密且不进入前端、普通日志、错误或 Git。
- 实现 Channels-owned Connect YouTube、OAuth return、Connected/Reauthorization Required/Disconnected 状态与账号/Channel 选择；其他页面复用该 flow。
- 在第一次 YouTube Connect/API 使用前执行当前 Terms/Privacy consent/re-consent；Cancel 不启动 OAuth/API，version/timestamp 可审计。
- English 与简体中文显示同一 canonical Terms/Privacy version、Scope purpose、平台限制和确认语义；Consent/Audit 记录保留展示 locale，但 locale 不改变授权范围或外部写入含义。
- 实现 YouTube Platform Version 所需的可编辑 Title、Description、Privacy、Audience/Required Settings、Channel、Video preview 与明确 Publish Confirmation。
- 每次确认建立独立、幂等、可重试且 tenant-bound 的 Platform Execution；实现 Publishing、Processing、Published、Failed、Needs Attention、Cancelled 的真实状态、平台 ID/URL、时间、历史和用户可理解恢复动作。
- 以真实 YouTube API 响应证明上传路径。未完成所需 Verification/Compliance Audit 时，只允许官方当前规则允许的可见性并在 UI/registry 标为 Beta/受限；不得宣称或执行不被允许的公开发布。D7 必须在最终 production/reviewer environment 重复真实证据。
- 对 retry、timeout、duplicate submit、OAuth expiry、quota/platform error 和 partial execution 建立 deterministic test adapter；最终 AC 证据不得用 mock 替代真实平台 E2E。
- Schedule 仅在能力、授权、取消、失败恢复和当前平台政策全部验证后开放；否则显示 Schedule Not Available。
- 更新 `config/integrations.yaml`、Data Flow/Retention 和公开 YouTube Integration 页面，使 Scope、数据、状态、disconnect 说明与生产 App 一致。

Non-goals:

- 不接入 Facebook、Instagram 或其他平台，不申请未来 Scope。
- 不把第三方审核通过作为 Stage Gate；只验证团队可控的 policy compliance、真实受限行为和 review readiness。
- 不以 mock OAuth、mock publish 或人工数据库状态证明 Stage 完成，也不把本 Stage 的受保护 integration evidence 误称为 AC-07 production acceptance。

Affected Surface:

- Google OAuth and YouTube adapter
- encrypted token storage and secret boundary
- async/idempotent Platform Execution
- Channels, Composer, Confirmation, Result and recovery UI
- Integration Registry, Data Flow and public Integration page

Architecture Impact:

- Material — D0 Architecture 和 machine contracts 所定义的外部授权、Secret/Token、异步执行、幂等、持久化和状态边界；Baseline 要求用户明确控制、平台执行独立且真实失败不误报 Published。
- Structural Enforcement: OAuth scope registry validation、adapter contract tests、idempotency/concurrency tests、token/log secret scans、tenant-bound execution tests 和 status transition checks。

Review Need:

- Code Review — 聚焦 OAuth state/PKCE/session 绑定（按 D0 架构适用项）、Scope 最小化、Token/Secret 防泄漏、幂等/重试/并发、用户确认与真实状态映射。

Dependencies:

- D3 and D4 accepted checkpoints
- D3 official website remains publicly accessible over HTTPS on the verified production domain, with current Privacy, Terms, Data Deletion, Security and YouTube Integration information
- D0-recorded control of official domain/email, target environment and Google Cloud/YouTube Developer Project
- Current policy/Scope/capability matrix revalidated immediately before implementation and real E2E

Risk:

- Level: High
- Rationale: 涉及生产凭据、第三方授权、外部写入、异步状态和平台政策；错误可能泄露 Token、重复发布或误导用户。

Verification Scope:

- Profile: Affected Integration
- Rationale: 需要覆盖 OAuth、database、worker/queue、YouTube adapter、UI、registry 和 external API，但全仓库回归留到 D7。

Required Verification:

- 运行 D2 canonical lint、type/static、build、unit、contract、migration、integration 和 security/secret scan commands。
- 运行 OAuth state/session/tenant、Scope registry、Token encryption/log redaction、refresh/expiry、adapter contract、idempotency、duplicate submit、retry/timeout 和 status mapping tests。
- 运行 policy trace：每个 Scope → Need → UI → User Action → Data → Retention → Deletion；验证 current official policy timestamp/source 与生产 App 配置一致。
- Real Human E2E：Connect actual authorized account → Upload actual user-owned video → Customize YouTube fields → Preview → Submit → Approve → Confirm → actual API upload → Track actual processing/result/platform ID/URL。
- 运行失败/恢复 Human E2E：授权过期或可控测试故障显示 Failed/Needs Attention 和 Reauthorize/Return to Content，不误报 Published。
- 在两种 locale 下验证 Connect/Consent、platform fields、Publish Confirmation、真实 result/failure/recovery；状态、Scope、限制和 destructive semantics 必须同义，切换语言不重复 OAuth 或外部写入。
- 验证未获允许的 public visibility 和未验证 Schedule 无可执行入口，registry/website/product 均显示真实 Beta/Available/Not Available 状态。
- 运行 D1 UI fidelity review，验证 Channels、consent、YouTube fields、confirmation、result/error/recovery 与定稿版本一致，未因平台适配改写 material semantics。

Asynchronous CI:

- Workflow: D2-established canonical CI；real external API E2E 由受保护环境运行
- Blocking for Stage Progression: Yes；真实 external E2E 也是阻塞证据，不能由普通 CI mock suite 替代

Required Gates:

- Self Verification
- Code Review
- Production Change Authorization — Human Owner 授权对已上线官网的 YouTube Integration/status、Privacy/Terms 或 OAuth domain/config 的生产更新。
- Platform Policy Readiness — owner 以执行时官方来源、planned production app 配置、Scope trace 和可见性限制证明可进入 D6/D7 hardening/review-ready 路径；不要求第三方批准。
- Human E2E
- Stage Acceptance

Stop Condition:

- 一个真实授权账号在受保护 production-equivalent integration environment 中完成实际 OAuth 与 YouTube API publish/track；所有结果、限制、状态和恢复动作真实；Token/Scope/tenant/idempotency 证据通过，且任何未获批准的能力保持不可用或准确受限。生产/评审环境证明明确保留给 D7。

## D6 — Revocation, Deletion, Audit, Security, and Operations

Goal:

完成用户可控的 Disconnect/Revoke/Delete、全事件 Audit、Retention/Data Flow、安全控制和生产操作闭环，使 trust boundary 可独立验证。

Authoritative References:

- Baseline：AC-09、AC-10、AC-11、AC-12、AC-13、AC-15、AC-16 及 Token、撤销、删除、租户隔离、安全、双语和真实披露约束。
- Approved Design：D-05、D-06；Channel states、Reauthorization、Disconnect、Destructive Action、Activity 与 error/recovery UX。
- D1-finalized UI package：Disconnect/Revoke/Delete、destructive confirmation、in-progress、success/failure/retry 与 Activity handoff。
- YouTube Developer Policies 的执行时当前 retention、revocation、deletion 与 user-control 条款。
- D0～D5：Architecture、Security/Data、contracts、Integration Registry、实际实现和生产配置。

Deliverables:

- 实现 Disconnect confirmation → stop new API operations → programmatic revoke → Token 删除 → 适用授权数据清理 → Audit；不能只改本地状态。
- 实现 JINGTANG Account/Workspace/Data 删除流程，并在 `/data-deletion` 与 UI 清楚区分 JINGTANG data、Disconnect 和第三方平台内容删除。
- 实现 YouTube Authorized Data refresh/delete policy jobs：适用普通数据最长 30 天刷新或删除，用户删除/撤销数据尽快且最迟 7 天完成；以可控时钟测试而非实际等待证明。
- 完成 Audit Log 覆盖 Baseline AC-11 的所有事件与 User、Workspace、Action、Target、Timestamp、Result 及必要技术元数据；普通用户只看有权限的 Workspace/Content Activity。
- 完成 `docs/security-and-data/README.md`，使生产 Data Flow Map 和 Retention Matrix 无 TBD，并与实际 source/region/processor/encryption/backup/cross-border/deletion path 对齐。
- 创建 `docs/OPERATIONS.md` 并实现 TLS、静态数据/Token 加密、Secret Management、环境隔离、生产访问控制与记录、监控告警、备份恢复、事件响应和基础漏洞管理的可验证流程。
- 同步更新 English/简体中文 Privacy、Terms、Data Deletion、Security 与 Integration pages，只陈述 D6 已验证且 D7 将在生产复核的事实，并保持同一 canonical policy version 与能力语义。
- 按 D1-finalized UI package 实现 destructive action、disconnecting/deletion in progress、success/failure/retry、keyboard/focus 与非颜色单一提示；如真实平台约束要求 material UX 变化，停止并重新 design-readiness。

Non-goals:

- 不自动删除第三方平台内容，不把 Disconnect 与 Delete 合并。
- 不宣称未取得的认证或未在生产验证的控制。
- 不扩大平台或产品功能范围。

Affected Surface:

- OAuth/token lifecycle and execution cancellation
- deletion and retention jobs
- audit persistence/query/UI
- data/security/operations authorities and infrastructure
- legal, security and Integration claims

Architecture Impact:

- Material — Architecture/Security/Data Authorities 的外部撤销、destructive write、retention scheduler、audit、encryption、backup/recovery 与 production access 边界；Baseline 明确要求真实撤销/清理和审计。
- Structural Enforcement: deletion/retention clock tests、revoke adapter tests、audit completeness schema、tenant/RBAC negative tests、secret/log scans、backup/restore drill evidence 与 security configuration checks。

Review Need:

- Code Review — 聚焦撤销与正在进行发布的竞态、删除范围/幂等、7/30 天策略、Audit 防篡改/权限、Token/Secret/PII 边界、backup/restore 和生产访问控制。

Dependencies:

- D5 accepted checkpoint

Risk:

- Level: High
- Rationale: 涉及不可逆数据删除、授权撤销、定时清理、安全控制和生产操作；错误会造成继续外部写入、数据残留或审计缺失。

Verification Scope:

- Profile: Affected Integration
- Rationale: 需集中验证 OAuth adapter、worker、database、audit、security/infra 与法律声明；全量回归仍留到 D7。

Required Verification:

- 运行 D2 canonical lint、type/static、build、unit、contract、migration、integration、E2E 和 security commands 的受影响集合。
- 运行 Disconnect/revoke/delete integration matrix，证明新 API 操作在 disconnect 后被拒绝、Token 被程序化撤销并删除、适用数据清理且重复请求幂等。
- 以 controllable clock 验证 7/30 天 retention 行为、授权失效 refresh/delete 和失败重试/告警，不依赖人工改库。
- 运行 AC-11 全事件 Audit coverage test，验证字段完整、tenant/RBAC 查询隔离和用户可见 Activity 语义。
- 运行 TLS/encryption/secret/log/tenant/RBAC/security config checks，执行 backup → restore drill、生产访问记录检查、incident tabletop 和基础 vulnerability scan。
- Human E2E：Track result → inspect Audit → Disconnect → revoke actual token → verify no new API operation → request data deletion → verify UI/status/audit and third-party-content distinction。
- 逐项核对 Data Flow、Retention Matrix、Privacy、Terms、Data Deletion、Security 与 Integration claims，无 TBD、虚假认证或实现漂移。
- 逐项核对 English/简体中文 Disconnect、Revoke、Delete、Activity、Privacy/Terms/Data Deletion/Security 文案与行为，确保删除范围、时间、第三方内容区别、失败/重试和安全声明语义一致。
- 运行 D1 UI fidelity review，验证 destructive actions、progress/recovery、Activity 与用户可见数据删除语义仍与批准 handoff 一致。

Asynchronous CI:

- Workflow: D2-established canonical CI plus protected security/operations checks
- Blocking for Stage Progression: Yes

Required Gates:

- Self Verification
- Code Review
- Production Change Authorization — Human Owner 授权对已上线 Privacy、Terms、Data Deletion、Security 与 Integration pages 的生产事实更新。
- Human E2E
- Stage Acceptance

Stop Condition:

- 真实 revoke/delete 路径、时间策略、Audit 全事件覆盖、安全检查和 restore drill 均有阻塞证据；Data Flow/Retention 无 TBD；所有公开数据/安全声明与实际控制一致。

## D7 — SaaS Production/Reviewer Launch, Developer Review Readiness, and Delivery Closure

Goal:

在 D3 官网已经先行生产上线的前提下，将 SaaS 与其后端/worker 部署为 production/reviewer-accessible Beta，证明真实企业完整闭环、全部 AC coverage、真实公开状态和正式 Developer Review submission readiness，并将第三方审批与团队可控 Acceptance 分离。

Authoritative References:

- Approved Baseline Revision 2：全部 AC 与 V1 Release Gate。
- Approved Design Revision 1：全部 material UX target 与 responsive/accessibility obligations。
- D1-finalized UI package：全部官网/SaaS implementation-ready derived specifications 与 Human UI Final Approval version。
- D0～D6 accepted Authorities、machine contracts、implementation、test/CI、Security/Data、Operations 和 Integration Registry。
- 部署与审核时最新 Google OAuth、YouTube Developer Policies 与 `videos.insert` 官方来源。

Deliverables:

- 保持 D3 已上线的 English/简体中文官网及公开法律/信任页面持续可用；经 Human Owner 授权后，将双语 SaaS、数据库/migrations、worker、storage、Secret、monitoring 和受保护 reviewer/test access 部署到 D0-approved production environment。
- 复核官网、SaaS、Developer App、Privacy、Terms、Data Deletion、Security、合同/联系人持续一致使用 D3 已验证主域名、域名邮箱和唯一英文法律主体表达；如需生产网站更新，必须走 Production Change Authorization。
- 在生产实际验证 TLS、静态数据/Token 加密、Secret Management、环境/租户隔离、RBAC、Audit、备份恢复、生产访问记录、事件响应与漏洞管理；Security 页面只保留被证据证明的声明。
- 由 `config/integrations.yaml` 和生产探测生成最终 capability/status：YouTube 根据真实审核/可见性状态标记 Available 或 Beta/受限；Facebook、Instagram、TikTok 及其他未接入平台保持 Coming Soon 且无 executable action。
- 为每个提交审核的生产 Integration 组装 Legal Entity、verified domain、官网/法律/Integration 页面、production OAuth、minimum permission matrix、Data Flow/Retention/Revocation/Deletion、reviewer test account、instructions、demo script/video、支持联系人、当前 review/production status 和 permission-to-UI trace。
- 在生产执行测试企业完整 journey，并保留机器、平台和 Human E2E evidence；不得使用模拟授权、模拟发布或人工改库。
- 在生产以 English 与简体中文分别执行关键 journey（至少一条完整旅程和另一语言的等价关键路径），验证 locale preference、对应 route、任务状态保持、用户内容原文和全部能力/法律/破坏性语义 parity。
- 执行 blocking full regression、production smoke、security/release checks；验证所有非目标能力仍未出现。
- 形成团队可控的 review-ready closure evidence。任何外部 review submission、DNS/production change 或公开 rollout 均需对应 Human Owner 明确授权；第三方最终批准不作为 Stage Acceptance。

Non-goals:

- 不等待或保证 Google/YouTube 最终审批结果，不把审核通过误写为本 Delivery Outcome。
- 不把未接入平台或未验证 Schedule/AI 能力标为 Available。
- 不在关闭阶段加入功能、重构或清理。

Affected Surface:

- production infrastructure and deployment configuration
- already-live production website plus SaaS production/reviewer environment and legal/trust surfaces
- production OAuth/YouTube integration and reviewer access
- all contracts, data/security/operations evidence and release controls

Architecture Impact:

- Material — D0 Architecture 与 D6 Security/Operations Authority 的 production deployment、environment isolation、Secret、migration、observability、backup/restore 和 external integration boundary；Baseline 要求生产实际控制与公开声明一致。
- Structural Enforcement: canonical infrastructure/config/security checks、migration verification、capability-to-public-status comparison、production smoke 和 blocking full regression。

Review Need:

- Code Review — 聚焦 release configuration、environment/tenant isolation、Secret exposure、migration safety、production status generation 和 external-write safeguards。

Dependencies:

- D3 official website production checkpoint remains valid and publicly accessible
- D6 accepted checkpoint
- Human Owner control of production environment, DNS/domain/email and Developer App configuration
- Production Change Authorization before any external write or deployment

Risk:

- Level: High
- Rationale: 生产变更、真实客户/平台数据、公开法律与安全声明及 release status 具有最大 blast radius。

Verification Scope:

- Profile: Full Regression
- Rationale: 最终关闭必须证明跨官网、SaaS、身份、tenant/RBAC、content/approval、OAuth/publish、audit/delete、security/operations 和生产配置的整体行为。

Required Verification:

- 运行 D2 建立的全部 canonical format、lint、type/static、build、unit、contract、migration、integration、E2E、安全与 full regression commands；结果必须来自最终生产候选状态。
- 运行 production smoke：全部 public routes、legal/security/integration links、auth、workspace、worker、storage、database、monitoring 与真实 capability/status 可用且一致。
- 运行 D1 final UI fidelity audit，覆盖官网与 SaaS 全部关键 screen/state、responsive、accessibility 和 component behavior；无未批准 material deviation。
- 运行 final localization audit：`en`/`zh-CN` catalog completeness、public locale routes/alternates、legal/capability parity、locale preference/fallback、320px reflow、用户创作内容不自动翻译和切换语言不重复外部写入。
- 执行 AC-18 production Human E2E：Register → Create Workspace → Invite Editor/Approver → Assign Role → Connect actual authorized account → Upload user-owned content → Customize → Preview → Submit → Approve → Confirm → actual Publish → Track actual result → Inspect Audit → Disconnect → Revoke actual token → Delete required platform data。
- 执行 release truth audit：每个产品/Integration/AI/Schedule/Security claim 可追溯到生产证据；无虚假截图、客户、Partner、认证、Available 或 executable Coming Soon action。
- 执行 final tenant/RBAC/security/deletion/retention/backup-restore evidence review，并确认 Data Flow/Retention 与生产配置无 TBD 或漂移。
- 验证 review evidence bundle 与生产 App、Scope、domain、legal pages、reviewer account/instructions/demo 和当前审核状态一致，可正式提交但不依赖第三方批准。

Asynchronous CI:

- Workflow: D2-established canonical full CI and protected production verification workflows
- Blocking for Stage Progression: Yes

Required Gates:

- Self Verification
- Code Review
- Production Change Authorization — Human Owner 对 production deployment、DNS、Developer Console 或 review submission 等外部写入逐项授权。
- Human E2E
- Stage Acceptance

Stop Condition:

- 全部 Stage 与 Gates 已通过；D3 双语生产官网持续公开可达，最终 full regression 阻塞通过；双语 SaaS production/reviewer environment 与至少一个真实生产配置渠道完成受当前政策允许的端到端闭环；AC-01～AC-18 均有可追溯证据；review bundle 达到正式提交条件；两种语言中的所有公开状态和声明与实际生产能力一致。第三方最终审批结果不影响 Delivery Acceptance，但会继续约束公开可用范围。

## Acceptance Criteria Coverage

| Criterion | Source | Primary Stage | Reverification Stage(s) | Reverification rationale |
| --- | --- | --- | --- | --- |
| AC-01 | `BASELINE.md` § Acceptance Criteria | D7 | None | 只有生产域名、Developer App 与全部法律/信任面同时存在时才能首次完整成立。 |
| AC-02 | `BASELINE.md` § Acceptance Criteria | D3 | D7 | D3 在官方验证域名完成完整官网 Production Launch；D7 证明其在 SaaS/reviewer closure 时仍公开可达且状态未漂移。 |
| AC-03 | `BASELINE.md` § Acceptance Criteria | D7 | None | AC 要求上线当日官网与产品状态整体一致；D3/D5 分别建立网站和集成机制，D7 首次以最终生产状态完整证明。 |
| AC-04 | `BASELINE.md` § Acceptance Criteria | D2 | D7 | D2 建立身份/Workspace；D7 在完整企业生产 journey 中重验。 |
| AC-05 | `BASELINE.md` § Acceptance Criteria | D5 | D7 | D5 首次覆盖成员、内容、审批、Channel/OAuth 与实际 Publish 的完整四角色权限；D7 做生产 RBAC E2E。 |
| AC-06 | `BASELINE.md` § Acceptance Criteria | D4 | D7 | D4 建立真实 upload/version/preview/approval；D7 与实际平台闭环重验。 |
| AC-07 | `BASELINE.md` § Acceptance Criteria | D7 | None | D5 只证明受保护环境中的真实 API slice；AC-07 的真实生产渠道、结果与历史由 D7 首次完整证明。 |
| AC-08 | `BASELINE.md` § Acceptance Criteria | D5 | D7 | D5 根据实际能力启用或明确禁用 Schedule；D7 防止生产状态漂移。 |
| AC-09 | `BASELINE.md` § Acceptance Criteria | D5 | D6, D7 | D5 建立 OAuth/Token/refresh；D6 重验生命周期和泄漏防护，D7 验证生产配置。 |
| AC-10 | `BASELINE.md` § Acceptance Criteria | D6 | D7 | D6 建立 revoke/delete/retention；D7 在生产真实账号与数据上重验。 |
| AC-11 | `BASELINE.md` § Acceptance Criteria | D6 | D7 | D6 首次覆盖完整事件矩阵；D7 用完整企业 journey 重验 Audit。 |
| AC-12 | `BASELINE.md` § Acceptance Criteria | D6 | D7 | D6 完成无 TBD 的 Data Flow/Retention 与披露；D7 对生产配置做最终一致性检查。 |
| AC-13 | `BASELINE.md` § Acceptance Criteria | D7 | None | AC 要求生产实际启用，只有 D7 首次完整成立。 |
| AC-14 | `BASELINE.md` § Acceptance Criteria | D7 | None | Review-ready evidence 必须基于最终 production app/config。 |
| AC-15 | `BASELINE.md` § Acceptance Criteria | D5 | D7 | D5 建立 YouTube consent/fields/confirmation/audit restriction；D7 复核当前政策和生产行为。 |
| AC-16 | `BASELINE.md` § Acceptance Criteria | D3 | D2, D4, D5, D6, D7 | D3 首次生产证明双语官网与 locale routes；D2 建立偏好/目录，D4～D6 验证 SaaS 各关键流程语义，D7 做最终双语生产闭环。 |
| AC-17 | `BASELINE.md` § Acceptance Criteria | D4 | D7 | D4 证明 AI 未启用或满足用户控制；D7 防止生产入口/claims 漂移。 |
| AC-18 | `BASELINE.md` § Acceptance Criteria | D7 | None | 完整真实企业 journey 是最终生产关闭证据。 |

## Plan-level Stop Condition

本 PLAN 只有在以下条件全部满足时关闭：

- D0～D7 依赖顺序成立，每个 Stage 的 Required Verification、blocking CI 与 Required Gates 均通过；
- D1 指定版本的 UI package 已完成 Human UI Final Approval，D2～D7 的最终 UI fidelity audit 没有未批准的 material deviation；
- D3 官网已先于 YouTube verification/audit 路径在已验证官方域名完成 Production Launch，并在 D7 关闭时持续公开可达；
- D7 最终 full regression、production smoke、安全/tenant/RBAC/delete/retention/restore 证据全部阻塞通过；
- AC-01～AC-18 每一项均有对应 Primary Stage 证据，所有列出的 Reverification 有最终证据；
- D1 完成关键 prototype Human walkthrough；Human E2E 在 D2 的第一条 runnable slice、D3 的 production website、D5 的真实平台 slice 和 D7 的完整生产 journey 均实际执行；
- English/简体中文官网、SaaS、法律/安全页面、Integration Registry、Developer App 和 review bundle 与最终生产能力一致；
- 至少一个真实生产配置渠道完成当前官方政策允许的端到端 Publish/Track；若第三方 Audit 尚未完成，受限可见性和 Beta 状态必须真实显示；
- Developer Review evidence 达到正式提交条件，但第三方审批、配额扩展或 audit 结果不作为 Delivery Acceptance；
- Facebook、Instagram、TikTok 及其他未接入平台保持 Coming Soon，未验证 Schedule/AI 无可执行入口；
- 没有已知 blocking regression、Baseline conflict、未授权 scope expansion 或需要隐藏的生产限制。

实施完成与外部发布授权保持分离：任何 production、DNS、Developer Console、review submission 或公开 rollout 写入仍需当时的 Human Owner 明确授权。

## Planning Limitations

- 当前仓库没有技术栈、部署、测试或 CI；D0/D2 必须建立真实 Owner 和命令，后续执行不得把本 PLAN 中的能力名称伪装成已经存在的命令。
- D0 必须由 Human Owner 决定架构、区域、处理方、正式域名/邮箱和唯一英文法律主体表达；本 PLAN 只规定这些决定必须先于依赖实现。
- D1 是独立 UI Design & Finalization Stage，但其成果仍是 Approved Design Revision 1 的 derived specification。任何新增 material IA、flow、screen responsibility、consent/recovery 或产品能力都必须停止并重新 design-readiness，不能由 UI Final Approval 越权批准。
- D3 是官网先行 Production Launch；官网上线不等于 YouTube Audit 已可提交。D5～D7 仍须提供 current in-production/reviewer-accessible SaaS、真实 YouTube flow、reviewer account 和完整 evidence bundle。
- YouTube 是执行顺序，不是新增 Product Target。若执行时官方政策、账号访问或团队可控技术限制使其无法满足 Baseline，停止 D5 并正式 replan；不要静默接入 Meta 或放宽 AC。
- Schedule 默认为 Not Available；AI Assistance 默认不进入 V1 实现。若任一能力后续进入范围，必须在当前 Baseline 条件内增加相应 machine contract、数据流、UI、测试和 re-verification，必要时重新 planning。
- Google/YouTube 最终审批与 Audit 是外部状态；计划只要求当前政策合规、真实受限行为和正式提交审核条件，不承诺第三方结果。
