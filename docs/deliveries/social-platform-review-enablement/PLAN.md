# Implementation Plan

## Planning Preflight

Planning Preflight: PASS

- Baseline: `docs/deliveries/social-platform-review-enablement/BASELINE.md`
- Delivery: JINGTANG Social Platform Developer Review Enablement
- Status: Approved
- Baseline Revision: 3
- Approval: Human Owner explicitly approved the recommended plan and implementation on 2026-08-24 after purchasing a 20 GB Tencent COS storage package, then approved the Review-only `local:v2` envelope amendment while preserving staging/production KMS. On 2026-08-25, the Human Owner explicitly authorized Revision 3 and superseded the earlier public-presentation decisions: official website login must enter the real SaaS, and public/SaaS copy must present the formal product without test or review-environment labeling.
- Production preservation: The accepted D3 website and D7 production target remain unchanged. This plan creates only a time-bounded `review` environment and platform-review slices.

## Outcome and Boundaries

在当前腾讯云首尔 Lighthouse 上以低资源 `review` Docker profile 运行真实 SaaS，但把 `review` 限定为内部部署术语：`jingtangai.com` 登录直达 `review.jingtangai.com/login`，官网与 SaaS 对用户按正式产品呈现，并按 Facebook → TikTok 的顺序交付真实最小权限纵向切片、双语审核体验与可提交证据。外部审核决定不由本 Plan 控制，任何尚未真实可用的能力继续显示 `Coming Soon`。

## Stage Progression

- 一次只执行一个 Stage。当前 Stage 的 Required Verification 和 Required Gates 未通过前不进入下一 Stage。
- Commit、push、腾讯云/DNS/OAuth Console 写入和部署均是单独的外部状态变更；仅在 Human Owner 明确授权相应范围后执行。
- Scope/Permission 必须在使用外部平台凭证前由 Human Owner 明确批准。
- Stage Acceptance、checkpoint 与外部审核提交均不得从测试通过自动推断。

## Stage Overview

| Stage | Outcome | Required Gates |
| --- | --- | --- |
| R0 | 固化 review 环境、生产保留边界、平台顺序与当前官方审核约束 | Authority consistency and policy source check |
| R1 | 实现本地可验证的低资源 review runtime profile、身份/Secret/容量控制和部署资产 | Self Verification + Code Review |
| R2 | 在首尔 Lighthouse/COS 上部署当前 SaaS，接通官网正式登录体验并证明官网不回退 | Deployment checks + Human E2E + Stage Acceptance |
| R3 | Facebook 最小权限真实纵向切片与审核包 | Scope Approval + Code Review + Acceptance Review + Human E2E |
| R4 | TikTok 最小权限真实纵向切片与审核包 | Scope Approval + Code Review + Acceptance Review + Human E2E |
| R5 | 全量 review regression、提交就绪记录与可回收/迁移收口 | Final Acceptance Review + Human E2E + Stage Acceptance |

## Execution Status — 2026-08-25

- R0: Complete. Knowledge routing, approved review exception, production preservation boundary and current platform-review authorities are aligned.
- R1: Complete and amended for the approved Review-only local envelope boundary; final amendment verification is recorded by the current implementation run.
  - Self Verification: PASS. Focused config/identity/runtime-secret/S3 tests passed (21 tests); database integration, contract, i18n, migration, operations and seven platform E2E journeys passed; lint, typecheck, production build, Secret scan and production dependency policy passed.
  - Runtime/deployment evidence: PASS. Review release checker, shell syntax, Compose rendering, pinned Caddy validation, no-public-port/resource markers and final diff whitespace check passed. Services use dedicated UID/GID `65532`; the ordinary host operator cannot read role Secret files.
  - Code Review: PASS. The final review found no open R1 P1/P2 finding. It closed the host-UID Secret exposure and client-IP trust gaps. Tencent COS signature/CORS/header compatibility is intentionally not inferred from the local S3-compatible harness and remains an R2 deployed smoke check.
  - Terraform validation: PASS with the repository-compatible Terraform 1.13.5 installed through `tfenv`; the D7 configuration validates without changing the production infrastructure target.
- R2: In progress; Stage Acceptance has not been granted. `review.jingtangai.com` is deployed on the authorized Seoul Lighthouse with HTTPS, isolated PostgreSQL, private COS source/backup paths, Review-only `local:v2` OAuth envelope, least-privilege CAM credentials and the existing single-ingress Caddy route. Human Owner verified login, Workspace creation, YouTube OAuth connection, direct private-COS upload and one private YouTube publish. The deployed upload smoke identified `HeadObject` as a required platform permission; the live CAM policy was corrected and the repository template/regression check now own that requirement. One failed pre-correction upload left an unclaimed `pending_upload` object; R2 closure fail-closes initiated uploads after 20 minutes and durably retries exact COS deletion. The single pre-correction orphan was then fail-closed with a minimized system audit and its exact COS key was removed; the successful `complete` asset remained unchanged and COS active usage returned to one object. The unused OAuth-key COS Bucket remains empty and uncredentialed and may be deleted at teardown. Runtime commit `817f46679f125b924a7e2a3a34023b20cbc3cb4f` is active after an immutable Review build under the production host's restrictive umask; package-time UID `65532` execution checks, 25/25 migrations, cleanup-function grants, platform health, worker zero-restart status, HTTPS/noindex smoke and COS capacity checks passed. Automatic cleanup Human E2E: PASS. With the completion request deliberately blocked after a successful direct COS upload, the unclaimed asset was fail-closed after approximately 20 minutes as `failed / upload_expired`; its system audit was recorded, Worker cleanup reported one success and zero failures, the exact COS object was independently confirmed absent, and the previously completed asset remained unchanged. R2 Stage Acceptance remains pending. Baseline Revision 3 website/SaaS presentation changes are implemented and self-verified in the repository: the full verification suite passed with Terraform validation, 127 unit tests, integration/migration/operations/security checks, eight platform E2E journeys and seven website E2E journeys. On 2026-08-25 the Human Owner granted Production Change Authorization `PCA-20260825-R2-FORMAL-PRESENTATION` for the current Seoul SaaS and official website update while preserving the non-promotion and future-D7 boundaries; deployment and post-deployment smoke are in progress.

## R0 — Authority and Review Boundary

### Implementation

- 建立本 Baseline/Plan 并更新 Knowledge Map。
- 在 Architecture/Security Authorities 中增加 time-bounded review 例外；明确不替代 D7 production。
- 复核 Meta/TikTok 当前官方产品、Scope、Sandbox/Review、演示与 URL 验证约束；具体权限在 R3/R4 前冻结。
- 将 Registry 保持为 `Coming Soon`，不预先增加未实现 Scope。

### Required Verification

- `docs/README.md` 能唯一路由本 Delivery。
- Baseline、Architecture、Security、Operations 和 Registry 不产生 production/review 语义冲突。
- 外部约束引用来自当前官方来源。

### Gate

- Authority consistency and policy source check: required.

## R1 — Review Runtime Profile

### Implementation

- 新增 `APP_ENV=review`，HTTPS Cookie、安全错误和测试 fault 行为与公开部署边界一致。
- 新增仅允许预创建账号的 review identity adapter；关闭公开注册、自助重置和固定测试验证码。
- 使用独立 PostgreSQL、单 worker 直接 outbox、COS direct upload、Review-only `local:v2` OAuth envelope 和静态最小权限 COS CAM 适配；根密钥与 detached key store 留在受保护主机持久卷且不进入备份，不得削弱 staging/production KMS config guards。
- 增加 `infra/tencent/review/` Compose、Caddy route、root-only Secret 模板、备份/恢复、容量检查、健康检查、资源限制、日志轮转和原子激活/回退脚本。
- 源素材单文件最大 500 MiB、活跃对象软配额 15 GB；不在主机持久盘保存媒体。
- 增加 review release checker 和 focused regression tests。

### Required Verification

- Focused unit/config/identity/COS/local-envelope tests，并回归 staging/production KMS guards。
- Compose config、Secret scan、production guard regression、build/type/lint。
- 本地容器 journey：login → Workspace → upload → existing YouTube test/private path → track → disconnect/delete。
- 资源限制和 no-public-database checks。

### Gates

- Self Verification: required.
- Code Review: required.

## R2 — Seoul Review Deployment

### External Inputs

- `review.jingtangai.com` DNS record。
- Review COS Bucket 名称/地域和最小权限 COS CAM Secret；本地主根密钥由受保护服务器脚本生成，不得在对话、Git、截图或备份中发送。Review 不购买或配置 KMS，正式 staging/production 仍按既有 KMS Authority 执行。
- 已授权 SSH deployment path 和 review OAuth redirect URL。

### Implementation

- 在现有 Caddy 下增加 review host route，不启动第二个 80/443 ingress。
- 初始化独立 review PostgreSQL、卷、网络、Secret 和备份路径。
- 部署 immutable image，执行 migration、health、TLS、noindex、resource 和 website regression。
- 创建 Human Owner 与平台 reviewer 专用账号。
- 将官网双语 Sign in 直接接到 `https://review.jingtangai.com/login`，同时保留无自助注册的授权账号边界。
- 审查官网、Legal/Security 与 SaaS 的全部用户可见内容：删除 test/private-beta/pre-launch/review-environment 和内部 Delivery/Stage/Gate 术语，以正式产品语言准确表达当前能力、平台限制和数据事实。

### Required Verification

- `jingtangai.com` 双语 production smoke 保持通过。
- `review.jingtangai.com` HTTPS、auth、upload、worker、audit、disconnect/delete、backup/restore 通过。
- 官网桌面端与移动端 Sign in 均直达真实 SaaS login；SaaS 不显示环境横幅，English/简体中文关键页面无内部测试/阶段措辞。
- Integration Registry、不可用操作、YouTube 私密上传限制、无自助注册、`noindex` 和临时基础设施安全边界保持不变。
- 2 核 4 GB 主机资源与 20 GB COS 软阈值在完整 journey 中不触发阻断。

### Gates

- Deployment checks: required.
- Human E2E: PASS, including the automatic abandoned-upload cleanup journey.
- Stage Acceptance: required before R3.

## R3 — Facebook Review Slice

### Implementation

- 使用当前官方文档冻结 Facebook Page publishing use case、最小 Permission Matrix 和数据流；Human Owner 明确批准后才配置 App。
- 实现 OAuth、目标 Page identity、明确 publish confirmation、真实执行/跟踪、断开/撤销/删除、审计和双语状态。
- 生成 Reviewer Account、Instructions、Permission-to-UI trace、Demo Script/Video 和支持材料。

### Gates

- Scope Approval: required before external credential use.
- Code Review: required.
- Acceptance Review: required.
- Human E2E: required.

## R4 — TikTok Review Slice

### Implementation

- 使用当前官方 Sandbox/Review 文档冻结 Login/Content Posting use case、最小 Scope Matrix 和数据流；Human Owner 明确批准后才配置 App。
- 实现 OAuth、Creator identity、视频 upload/direct post、平台 privacy/audience 要求、真实结果、断开/撤销/删除、审计和双语状态。
- 生成 Reviewer Account、Instructions、Scope-to-UI trace、Demo Script/Video 和支持材料。

### Gates

- Scope Approval: required before external credential use.
- Code Review: required.
- Acceptance Review: required.
- Human E2E: required.

## R5 — Submission Readiness and Closure

### Implementation

- 执行官网、review SaaS、tenant/RBAC、upload/approve/publish/track/revoke/delete、双语/移动端、安全和备份恢复全量回归。
- 执行 release-truth content audit，确认外部页面不含内部环境或 Delivery 术语，同时没有把 `Coming Soon`、私密上传、Schedule、账号访问或安全限制扩大为不可证实的可用状态。
- 确认 Facebook/TikTok Registry 仍与真实 production state 一致；记录 `submission_ready` 或实际外部状态但不把第三方批准写成 Acceptance。
- 输出受保护的 reviewer handoff checklist 和 review 环境 teardown/migration checklist。

### Gates

- Final Acceptance Review: required.
- Human E2E: required.
- Stage Acceptance: required.
- Checkpoint requires separate Human Owner approval.
