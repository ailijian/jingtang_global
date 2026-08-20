# Delivery Baseline

Delivery: JINGTANG 海外官网与 SaaS 第一版上线
Scope: project
Status: Approved
Baseline Revision: 2

## Goal

以 JINGTANG 品牌上线英文优先、同时完整提供简体中文的海外官网和首版 B2B SaaS，交付真实、安全、用户可控、满足当前适用开发者政策并具备正式提交审核条件的全球社交发布与企业内容审批闭环，并使全部对外承诺与实际生产能力一致。

## User Outcome

一个真实企业可以在单一工作空间中以 English 或简体中文配置团队与权限，通过官方授权连接自己的海外社交账号，上传其有权使用的素材，按平台定制、预览和审批内容，明确确认发布并跟踪结果，随后可撤销授权和删除相关数据；官网访客能够以 English 或简体中文准确理解 JINGTANG 的产品、真实可用能力、数据处理方式与平台集成状态。

## Non-goals

- 第一版不建设通用低代码或 Zapier 式工作流、条件工作流、通用 Webhook 与大而全的 Marketing Automation Platform。
- 第一版不包含 Ads、CRM、DM、评论管理、Social Listening、Influencer Management、AI Customer Service、Full BI 或 Advanced Social Analytics。
- 第一版不以自动视频编辑、高级 AI 视频生成或数百个 Integration 为交付目标。
- 完整的 AI Visibility SaaS 不作为 Social Publishing 第一版上线前提；能力未真实上线时只可作为 Services 或 Early Access 展示。
- 第一版不要求 Agency 多客户 Workspace、Enterprise 级细粒度角色体系或所有平台统一支持 Schedule。
- 第一版不支持从第三方平台自动抓取、下载并跨平台搬运内容。

## Key Decisions

- 海外品牌为 `JINGTANG`，法律主体为 `鲸汤（上海）智能科技有限公司`；公司、战略和首版产品定位分别为 `Global Marketing Technology Company`、`Global Marketing Infrastructure` 和 `Global Social Publishing + Enterprise Content Approval`。
- JINGTANG 第一版是面向真实企业客户的多租户 B2B SaaS，而不是代运营工具、内部上传脚本或私人测试 Utility。
- 第一版产品边界为 Social Publishing 加 Basic Enterprise Content Workflow，核心闭环为 `Connect → Create → Customize → Approve → Publish → Track → Revoke → Delete`。
- 第一版采用 Owner / Admin、Editor、Approver / Publisher、Viewer 四类角色，并以 `Draft → Submit for Approval → Approve / Reject → Publish / Schedule` 为基础审批流程。
- 内容统一使用 Draft、Pending Approval、Rejected、Approved、Scheduled、Publishing、Processing、Published、Failed、Needs Attention、Cancelled 状态。
- 用户以自己拥有或获授权的 Source Asset 创建彼此独立的平台版本；用户主动选择平台和账号，并对每个平台版本及最终写入操作拥有控制权。
- 所有社交账号只通过官方授权机制连接，只申请当前真实功能所需的最小 Scope / Permission；不索取或保存平台密码，不模拟登录，不以客户 Cookie 代替授权。
- 官网和产品统一使用 Available、Beta / Early Access、Coming Soon 表示真实状态；只有实际生产可用的能力才能标为 Available。
- Wave 1 表示 YouTube、Facebook、Instagram 的平台接入优先级，不构成三个平台必须同时 Available 的首版承诺；V1 Release Gate 以至少一个真实生产渠道完成端到端闭环为最低平台条件。
- TikTok 属于 Wave 2，在本 Delivery 中保持 Coming Soon，不纳入本 Delivery 的功能范围或 Acceptance Criteria；LinkedIn、Pinterest、X 同属后续接入范围。
- Publish Now 与 Schedule 按本 Delivery 实际接入平台的能力分别开放。
- AI 可以提供可选的文案、标题、翻译、本地化和标签建议，但用户必须能够查看、修改、删除或拒绝 AI 输出，AI 不得替代用户作出最终发布决定。
- 官网与 SaaS 第一版均提供 English（`en`）和简体中文（`zh-CN`）界面，默认英文并允许用户显式切换；语言偏好应被保留，切换语言不得丢失当前页面、Workspace、草稿或任务上下文。用户创作内容保持原文，不因界面语言自动翻译。首版主 CTA 的英文为 `Book a Demo`；SaaS Product 与 Professional Services 必须清楚区分。
- 每个平台按 `Need → Permission → UI → User Action → Data → Retention → Deletion` 单独建立开发者审核证据，不因整体合规而批量申请未来权限。

## Preserved Constraints

- Brand、官网、SaaS、OAuth / Developer App、法律页面、合同和对外联系人中的品牌与法律主体身份必须一致；正式提交 Developer Review 前必须冻结唯一英文法律主体表达。
- 官网、Integration 页面、Security 页面和销售材料只能陈述真实能力，不得伪造客户、合作伙伴、Partner 身份、认证、产品截图或安全声明。
- 用户必须对上传内容拥有合法权利；JINGTANG 不因上传取得内容所有权，也不得自动添加 JINGTANG 水印、Logo、推广链接或宣传文字。
- 发布、Schedule、Disclosure、授权、撤销和删除必须由有权用户明确触发或确认；系统不得静默扩大平台选择、修改最终内容或未经同意开始外部发布。
- 平台接入必须遵守提交与上线时有效的官方政策、Scope、审核、配额和功能限制；平台能力差异不得为追求统一 UI 而被掩盖。
- OAuth Token 和生产 Secret 必须受加密、最小访问、环境隔离和日志防泄漏保护，不得暴露到前端、普通日志、错误信息或 Git。
- Disconnect 必须停止后续 API 操作并执行真实撤销、Token 删除、适用数据清理和审计，不能只修改本地连接状态。
- Privacy、Terms、Data Deletion 与数据保留承诺必须对应真实 Data Flow；服务器区域、处理方、备份、跨境路径和每类数据的保留期必须在生产上线前完成审查与定案。
- 首版必须保持租户隔离、RBAC、传输与静态加密、备份与恢复、生产访问控制及日志、事件响应和基础漏洞管理。
- 官网与 SaaS 的中英文产品定位、功能与 Integration 状态、法律主体、Privacy、Terms、Data Deletion、Security、Consent、错误恢复和破坏性操作语义必须一致；不得因翻译遗漏而隐藏限制、扩大能力或改变用户控制。
- AI Visibility 不承诺保证排名或推荐，其数据只能来自正式允许的 API、合规数据接口、明确允许的公开体验或授权数据源。
- 阶段一资源优先用于核心闭环的可靠性，不以功能数量作为第一版完成标准。

## Acceptance Criteria

- AC-01: 在生产上线及 Developer Review 前，JINGTANG 已冻结并统一使用一个已验证的官方主域名、域名邮箱和唯一英文法律主体表达；官网、SaaS、各 Developer App、Privacy、Terms、Data Deletion 与 Security 页面均显示一致的品牌和法律主体身份。
- AC-02: 官方网站默认提供英文版，并为 English 和简体中文公开提供 Home、Social Publishing、Workflow & Approvals、Integrations、所有被展示为可用的 Integration 详情页、About、Contact、Security、Privacy、Terms 和 Data Deletion；网站不是仅含 Landing Page、Login 或 Coming Soon 的占位站，英文主 CTA 为 `Book a Demo`。
- AC-03: 官网与产品中的每项功能和 Integration 均显示与上线当日能力一致的 Available、Beta / Early Access 或 Coming Soon 状态；未完成的能力没有可用状态、虚假功能截图或可执行入口，未形成真实 SaaS 的 AI Visibility 只以 Services 或 Early Access 展示。
- AC-04: 用户能够完成 Sign Up、Login、Logout、Password Reset 或等价身份流程，并能创建和配置 Workspace。
- AC-05: Owner / Admin 能邀请和移除成员、管理 Workspace、Channels、OAuth 与设置；Editor 能上传、创建、编辑和提交；Approver / Publisher 能批准、拒绝和发布；Viewer 保持只读，四类权限在产品中被实际执行。
- AC-06: 授权用户能够上传其有权使用的 Source Asset，主动选择目标平台与具体账号，为各平台创建和编辑相互独立的版本，查看最终预览，并完成 Submit、Approve 或 Reject。
- AC-07: 至少一个真实生产接入的社交渠道能够在有权用户明确确认内容、平台和账号后完成 Publish Now，并显示真实的 Processing、Published、Failed 或 Needs Attention 结果、平台 ID / URL、发布时间、历史与可理解的失败处理；产品使用已冻结的内容状态模型，不把失败或处理中状态误报为 Published。
- AC-08: Schedule 只在技术能力、授权有效性、平台规则、取消与失败恢复均已验证的渠道开放；每个平台明确显示 Publish Now、Schedule Supported 或 Schedule Not Available，未验证的平台不能通过统一 UI 获得虚假 Schedule 能力。
- AC-09: 每个已接入渠道均使用官方 OAuth 或平台授权流程，申请的每个 Scope / Permission 都能映射到真实用户功能；Token 加密存储、受限访问且不出现在前端、普通日志或错误信息中，产品支持刷新、失效识别和必要的重新授权。
- AC-10: 用户 Disconnect 或删除请求会停止新的平台 API 操作、程序化撤销授权、删除 Token 和适用的授权数据并留下 Audit Log；`/data-deletion` 清楚区分删除 JINGTANG 保存的数据与删除第三方平台自身内容。若接入 YouTube，普通 Authorized API Data 最长 30 个自然日后被刷新或删除，适用的用户删除或撤销数据最迟 7 个自然日内完成清理。
- AC-11: Audit Log 至少覆盖登录、成员邀请、角色变更、账号连接/断开/重新授权、内容创建/编辑/提交/批准/拒绝、发布/Schedule/取消、发布结果和数据删除，并记录 User、Workspace、Action、Target、Timestamp、Result 及必要技术元数据。
- AC-12: Privacy、Terms 及适用的用户同意流程准确披露账号、OAuth / 平台、内容、安全/技术与实际 AI 数据的用途、存储、访问、第三方、跨境、保留和删除；生产 Data Flow Map 与 Retention Matrix 不再含 TBD，并覆盖数据来源、区域、处理方、加密、备份和删除路径。
- AC-13: 生产环境实际启用 TLS、静态数据加密、OAuth Token 加密、Secret Management、环境隔离、租户隔离、RBAC、审计、备份与恢复、生产访问控制与记录、事件响应和基础漏洞管理；Security 页面只描述这些已验证能力，未取得的认证不被宣称。
- AC-14: 对每个提交生产权限或审核的 Integration，存在与生产 App 一致的 Legal Entity、已验证域名、公开官网和法律页面、Integration 页面、真实 SaaS、生产式 OAuth、最小权限 Matrix、Data Flow / Retention / Revocation / Deletion 说明、Reviewer Test Account、Instructions、Demo Script / Video、支持联系人和当前审核/生产状态；每个权限均可追溯到真实 UI 与用户动作。
- AC-15: 若首版接入 YouTube，用户在访问相关 API 功能前已主动同意当前 Privacy 与 Terms；发布页显示目标 Channel、Video、可编辑 Title 和 Description、用户选择的 Privacy、适用 Audience / Required Settings、最终 Preview 与明确 Publish Confirmation；未完成所需 Verification / Compliance Audit 时不宣称或执行不被允许的公开发布。
- AC-16: 官网与 SaaS 的全部 in-scope 页面、关键流程、状态、错误、Consent、法律/安全内容和破坏性操作均提供 English 与简体中文；英文为默认语言，用户可显式切换且偏好被保留，切换时不丢失当前页面、Workspace、草稿或任务状态。官网为两个语言版本提供可直接访问且可索引的稳定地址和正确的语言替代关系；两种语言的产品能力、Integration 状态、限制、法律主体与用户控制语义保持一致，在 320px 及以上支持的响应式宽度无阻断性截断或溢出。用户创作内容不被界面语言切换自动翻译。
- AC-17: 若首版提供 AI Assistance，任何生成的 Caption、Title、Description、Hashtag、翻译或本地化结果都能在提交外部平台前被用户查看、修改、删除或拒绝，且不会自动添加 JINGTANG 品牌内容或绕过最终确认。
- AC-18: 一个测试企业能够真实完成 `Register → Create Workspace → Invite Editor / Approver → Assign Role → Connect Authorized Account → Upload User-owned Content → Customize → Preview → Submit → Approve → Confirm → Publish → Track Result → Inspect Audit Log → Disconnect → Revoke Token → Delete Required Platform Data`，全程不依赖模拟授权、模拟发布或人工改库才能闭环。

## Amendment Record

- Revision 2 — 2026-08-20：JINGTANG Human Owner 在本 Delivery 的 D1 设计审阅中明确要求“我想确认有中英双语吗？如果没有，请加这条需求”。本修订将 English / 简体中文从可选一致性约束升级为官网与 SaaS V1 的必备能力，并新增 AC-16；英文默认、真实能力、用户控制、既有范围和已接受 D0 架构决策保持不变。

## Authoritative References

### Decision Input

- [鲸汤 JINGTANG 海外官网与 SaaS 第一版上线方案 v0.3（定稿版）](<../../鲸汤 JINGTANG 海外官网与 SaaS 第一版上线方案 v0.3（定稿版）.md>) — 用于形成本 Baseline 的已定稿决策输入；Baseline Approved 后，不再作为本 Delivery 的 Goal、边界、Preserved Constraints 或 Acceptance Criteria 的平行 Authority。

### External Constraint Authorities

- [Google OAuth 2.0 Production Policy Compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance) — 生产 OAuth 身份、域名、Homepage、最小 Scope 与验证约束。
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) — YouTube 授权数据保留、撤销、删除和用户控制约束。
- [YouTube `videos.insert` Reference](https://developers.google.com/youtube/v3/docs/videos/insert) — 未审核项目的上传可见性与 Compliance Audit Gate。
