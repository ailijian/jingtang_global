# Implementation Plan

## Planning Preflight

Planning Preflight: PASS

- Baseline: `docs/deliveries/social-platform-review-enablement/BASELINE.md`
- Delivery: JINGTANG Social Platform Developer Review Enablement
- Status: Approved
- Baseline Revision: 6
- Approval: Human Owner explicitly approved the recommended plan and implementation on 2026-08-24 after purchasing a 20 GB Tencent COS storage package, then approved the Review-only `local:v2` envelope amendment while preserving staging/production KMS. On 2026-08-25, the Human Owner explicitly authorized Revision 3 and superseded the earlier public-presentation decisions: official website login must enter the real SaaS, and public/SaaS copy must present the formal product without test or review-environment labeling. On 2026-08-26, the Human Owner explicitly authorized Revision 4, the complete R3 Facebook Scope package, company Business Portfolio Meta App creation/configuration, R3 implementation, and one controlled real Human E2E publish while preserving the later external-review, public-availability, checkpoint and synchronization Gates. On 2026-08-27, the Human Owner authorized Revision 5: Facebook reviewer materials and external applications move to the unified R5 submission stage, R3 technical development is formally closed, and TikTok R4 Scope Approval may start. Later on 2026-08-27, the Human Owner authorized Revision 6: the complete TikTok Scope package, company TikTok Organization/App configuration, exact approved permissions, R4 implementation and one controlled private `SELF_ONLY` Human E2E publish. External TikTok audit/App Review, public `Available`, checkpoint and repository synchronization remain separately gated.
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
| R3 | Facebook 最小权限真实纵向切片；平台提交材料统一在 R5 生成 | Scope Approval + Code Review + Acceptance Review + Human E2E |
| R4 | TikTok 最小权限真实纵向切片；平台提交材料统一在 R5 生成 | Scope Approval + Code Review + Acceptance Review + Human E2E |
| R5 | 全量 review regression、提交就绪记录与可回收/迁移收口 | Final Acceptance Review + Human E2E + Stage Acceptance |

## Execution Status — 2026-08-28

- R0: Complete. Knowledge routing, approved review exception, production preservation boundary and current platform-review authorities are aligned.
- R1: Complete and amended for the approved Review-only local envelope boundary; final amendment verification is recorded by the current implementation run.
  - Self Verification: PASS. Focused config/identity/runtime-secret/S3 tests passed (21 tests); database integration, contract, i18n, migration, operations and seven platform E2E journeys passed; lint, typecheck, production build, Secret scan and production dependency policy passed.
  - Runtime/deployment evidence: PASS. Review release checker, shell syntax, Compose rendering, pinned Caddy validation, no-public-port/resource markers and final diff whitespace check passed. Services use dedicated UID/GID `65532`; the ordinary host operator cannot read role Secret files.
  - Code Review: PASS. The final review found no open R1 P1/P2 finding. It closed the host-UID Secret exposure and client-IP trust gaps. Tencent COS signature/CORS/header compatibility is intentionally not inferred from the local S3-compatible harness and remains an R2 deployed smoke check.
  - Terraform validation: PASS with the repository-compatible Terraform 1.13.5 installed through `tfenv`; the D7 configuration validates without changing the production infrastructure target.
- R2: Complete and accepted. `review.jingtangai.com` is deployed on the authorized Seoul Lighthouse with HTTPS, isolated PostgreSQL, private COS source/backup paths, Review-only `local:v2` OAuth envelope, least-privilege CAM credentials and the existing single-ingress Caddy route. Human Owner verified login, Workspace creation, YouTube OAuth connection, direct private-COS upload and one private YouTube publish. The deployed upload smoke identified `HeadObject` as a required platform permission; the live CAM policy was corrected and the repository template/regression check now own that requirement. One failed pre-correction upload left an unclaimed `pending_upload` object; R2 closure fail-closes initiated uploads after 20 minutes and durably retries exact COS deletion. The single pre-correction orphan was then fail-closed with a minimized system audit and its exact COS key was removed; the successful `complete` asset remained unchanged and COS active usage returned to one object. The unused OAuth-key COS Bucket remains empty and uncredentialed and may be deleted at teardown. Automatic cleanup Human E2E: PASS. With the completion request deliberately blocked after a successful direct COS upload, the unclaimed asset was fail-closed after approximately 20 minutes as `failed / upload_expired`; its system audit was recorded, Worker cleanup reported one success and zero failures, the exact COS object was independently confirmed absent, and the previously completed asset remained unchanged. Baseline Revision 3 website/SaaS presentation changes passed Terraform validation, 133 unit tests, integration/migration/operations/security checks, eight platform E2E journeys and seven website E2E journeys. On 2026-08-25 the Human Owner granted Production Change Authorization `PCA-20260825-R2-FORMAL-PRESENTATION` for the current Seoul SaaS and official website update while preserving the non-promotion and future-D7 boundaries. Candidate commit `15213db673cc8ff15357c96d4bba841a1681cc87` passed blocking CI run `32852647482`; its two immutable Review archives passed local and remote SHA256 validation before activation. Review activation recorded the same commit and change reference, found all 25 migrations applied, and passed image-label, Compose/Caddy, HTTPS, `noindex`, health and website-preservation checks. Public website workflow run `32855526418` deployed the same commit and passed its production smoke. Independent post-deployment verification passed all 19 authoritative HTTPS website routes, bilingual formal-copy and policy-version checks, exact official Sign in links, runtime health and zero-restart checks; a real browser click from the English website reached `https://review.jingtangai.com/login` and rendered the JINGTANG Workspace login controls. Both live release pointers equal `15213db673cc8ff15357c96d4bba841a1681cc87`. The repository now also contains the derived clean-host deployment and current-Seoul maintenance runbook, whose commands, links, release checks and live-host assumptions were verified before acceptance. On 2026-08-25 the Human Owner explicitly granted R2 Stage Acceptance and authorized its checkpoint and repository synchronization. R3 remains separately gated by Facebook Scope Approval before any external credential use.
- R3: Complete and technically accepted. On 2026-08-26 the Human Owner explicitly approved the complete Facebook Scope package, exactly `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, the documented data/deletion boundary, one controlled real Page-video Human E2E write, and the durable company-owned Meta App ID exception. On 2026-08-27 the Human Owner approved moving reviewer handoff/screencast, Business Verification, Advanced Access and external App Review to R5, and explicitly instructed formal closure of R3 technical development. Public availability, external submission, checkpoint and repository synchronization remain separately gated.
  - Repository candidate: implemented and self-verified. OAuth and exact Page selection, the three-scope allowlist, immutable MP4 Publish Now, pre-publish user/Page/task revalidation, streaming size/hash verification, result tracking, deny-first disconnect/revoke/deauthorization/deletion, one-use callback claims, bounded callbacks, encrypted token/candidate retirement, bilingual UI/legal content, Review runtime wiring and public `Coming Soon` truth are present.
  - Final Self Verification: PASS on 2026-08-27 for deployed commit `e0a1f9cfc19971b442671fab0b4915d0c4547e0f`. The final repository state passed formatting, lint, typecheck, production builds, Terraform and release checks, 160 unit tests, contract/i18n/site checks, clean and forward migration verification, all six integration suites, eight platform E2E journeys, seven website E2E journeys, backup/restore controls, Secret scan and the production dependency policy. One moderate production dependency finding remains below the blocking `high` threshold.
  - Code Review: PASS. Final review of the Facebook diagnostics, Graph error classification, upload-session signature preservation, exact media type, migration and release-control diff found no open P1/P2 finding; the full verification above ran on the reviewed commit.
  - Deployment evidence: PASS for the controlled Review slice. The host `current-release`, platform and worker images all resolve to `e0a1f9cfc19971b442671fab0b4915d0c4547e0f`; platform/PostgreSQL are healthy, worker is running, all three services have zero restarts, HTTPS health returns `ready` with `noindex`, and the server retains only the current `e0a1f9cfc19971b442671fab0b4915d0c4547e0f` and immediate rollback `c2c7f4ba4094f196c3a5fab3b72406f98479e025` release/image sets. The incremental transfer reused the deployed image archive and sent 255 MB instead of uploading the complete dependency archive; successful activation automatically pruned every older release and image.
  - Human E2E publish: PASS. The company-controlled Meta identity authorized the exact three scopes, selected Page `1280459905148968` (`Jingtang`), and published one approved MP4 exactly once. JINGTANG persisted Meta video ID `1059512050224957`, the exact Page video URL and `published`; the Human Owner independently observed the matching video on the selected Facebook Page. Historical failed executions remain immutable and did not trigger a duplicate publish.
  - Human E2E disconnect/reconnect: PASS. The Human Owner revoked the connected Facebook authorization and observed the disconnected UI before reconnecting the same Page. Production lifecycle operation `3691a148-b4cd-41eb-ad27-c5eeb8599817` completed all `load_authorization`, `provider_revoke`, and `local_authorized_data_delete` steps with no failure category; immutable audit evidence records `revocation_outcome: provider_revoked` and `authorized_data_deleted: true`. The historical execution remains `published` while its Meta provider ID/URL and authorized Page identity snapshot were pseudonymized, so JINGTANG no longer renders the external post link and does not claim to delete the Facebook-hosted copy. The same Page `1280459905148968` (`Jingtang`) then reconnected with the exact approved scopes and fresh authorization material; reconnect did not rewrite historical execution evidence or restore deleted provider links.
  - Callback reachability and signature rejection: PASS for deployed fail-closed routing. HTTPS `GET` on the deauthorization and data-deletion callbacks returns `405`, empty `POST` returns `400`, health returns `200`, and the deletion-status route remains non-enumerable without a valid confirmation code. The focused Meta adapter suite passes all 16 tests, including HMAC-SHA256, tamper, stale-request and algorithm-downgrade rejection. Fresh production `POST` requests carrying a fabricated signed request returned `403 permission_denied` on both callbacks, created no provider-deletion record and left the active connection unchanged.
  - Meta callback configuration inspection: PASS. The App Dashboard Basic settings contain the exact deployed data-deletion callback `https://review.jingtangai.com/api/v1/channels/facebook/data-deletion`. After the Human Owner saved `https://review.jingtangai.com/api/v1/channels/facebook/deauthorize`, the Advanced input rendered empty on refresh; an authenticated read of the authoritative Meta Graph Application object returned that exact `deauth_callback_url`, proving the value persisted and isolating the empty input to Dashboard presentation. The adjacent Native/Desktop App switch is unrelated and remains disabled for this server-side Web SaaS.
  - Valid signed deauthorization callback Human E2E: PASS. After the Human Owner removed JINGTANG from Facebook Business Integrations, Meta called the configured endpoint at `2026-08-27 09:24:46 UTC`. Lifecycle operation `4b5b57cf-020a-4b40-a6d3-3a8f73733d44` completed deny-first cleanup with all three steps successful; token-retirement operation `4593f846-6100-4141-8710-6af5ee7b06ad` completed; and the Channel reached `disconnected` with Page identity, scopes, authorization subject, token envelope and key reference absent. The journey exposed a provider deletion-confirmation record that remained `pending` after cleanup; the disconnect transaction now automatically completes matching Facebook confirmation records only when every associated Channel is disconnected, with a real-database regression covering callback request, key retirement, final disconnect and automatic confirmation closure.
  - Deauthorization closure release: PASS. Commit `e0a1f9cfc19971b442671fab0b4915d0c4547e0f` activated the automatic confirmation closure. The one production record created by the pre-fix callback was safely reconciled through the existing status transition and now reports `completed`; zero eligible Facebook confirmation records remain pending. The production Facebook Channel remains `disconnected` with all authorized identity, scope and token fields absent, and post-activation platform/worker logs contain no error event.
  - Valid signed data-deletion callback Human E2E: PASS. At `2026-08-27 10:26 UTC`, the Human Owner used the removed Facebook Business Integration's native information-deletion request. Meta displayed JINGTANG's confirmation code and status link after the deployed callback accepted the signed request. Production persisted a second provider deletion request as `completed` with zero associated Channels because deauthorization had already removed every matching authorization; the status link independently returned `completed`, zero Facebook requests remain pending, the Channel remains fully redacted and disconnected, HTTPS health returns `200`, and platform/worker logs contain no error event.
  - Acceptance Review: PASS on 2026-08-27. The approved R3 scope is implemented without broader Meta/Instagram permissions; the deployed commit passed the final full repository verification, Code Review and controlled deployment checks; real Page publish, disconnect/reconnect, signed deauthorization and signed data-deletion Human E2E all passed; historical records remain immutable and pseudonymized after authorization deletion; Registry/public truth remains `Coming Soon` / `production_available: false`. No blocking R3 technical acceptance issue remains. The unified reviewer package and external prerequisites are intentionally deferred and are not represented as completed.
  - Stage Acceptance: PASS for the R3 technical slice on 2026-08-27. The Human Owner explicitly instructed formal R3 technical closure and approved the unified R5 submission boundary. This acceptance does not authorize public `Available`, Business Verification, Advanced Access, external App Review submission, checkpoint or repository synchronization.
  - Deferred R5 boundary: Facebook Reviewer Account, Instructions, Permission-to-UI trace, Demo Script/Video, Business Verification, Advanced Access and external App Review are unified with the TikTok submission-readiness work. Every item remains pending until R5 records evidence; deferral is not a pass.
- R4: PASS and technically accepted on 2026-08-28. On 2026-08-27 the Human Owner approved Login Kit Web plus Direct Post Video, automatic `user.info.basic` plus exactly `video.publish`, company TikTok Organization-owned durable App identity, `FILE_UPLOAD` only, unaudited controlled private-account use with manual `SELF_ONLY`, implementation and one controlled private Human E2E publish. The deployed slice completed that one private post without duplication, and an independently observed retry later reached disconnected/cleaned local state automatically without a database intervention. The formal-presentation, Architecture/Security/Data, legal/versioned-consent, AC-10, endpoint-boundary and Registry findings are remediated; final verification, Code Review, protected CI, exact Review deployment and Acceptance re-review passed. Public `Coming Soon` / `production_available: false` remains unchanged. External audit/App Review, public `Available`, R5 work and repository synchronization remain separately gated.
  - Developer configuration: PASS for the controlled Sandbox. Company Organization `7678667255361717268` owns App `7678647396784326677`; Sandbox `7678676933508892692` contains Login Kit Web and Content Posting API Direct Post, the exact Review redirect URI, automatic `user.info.basic`, exactly `video.publish`, and target user `lijiancn`. No Client Secret is recorded in repository documentation.
  - Controlled deployment: PASS for commit `ac2a5f64988a37a986b8611a1d6357e8020f2d7b`. The final state passed formatting, lint, typecheck, package/platform/site builds, Terraform and release checks, 185 unit tests, contract/i18n checks, all database integration and migration suites, eight platform E2E journeys, seven website E2E journeys, operations/backup-restore/security checks and Secret scan. The Review release pointer and platform/worker images resolve to that commit; platform/PostgreSQL are healthy, maintenance timers are active, HTTPS health returns `200` with `noindex`, and activation retained only the current and immediate rollback releases. The incremental transfer sent approximately 127 MB for the approximately 401 MB archive by reusing the deployed dependency-layer cache.
  - Private Direct Post Human E2E: PASS. The authorized Sandbox target account connected, fresh Creator Info returned manual `SELF_ONLY`, and one approved MP4 completed as a private TikTok post. Historical failed attempts remained immutable and the successful attempt did not create a duplicate. TikTok did not return a public post URL for this unaudited private post; the UI correctly records the private success without fabricating an external link.
  - Publishing-label closure: PASS in deployed commit `ac2a5f64988a37a986b8611a1d6357e8020f2d7b`. TikTok publishing actions and execution statuses use TikTok-specific bilingual labels rather than generic or YouTube-derived wording; the focused i18n regression and full verification passed.
  - Disconnect/revoke/delete closure release: PASS for local commit `54df1e60aa65ba35fbabbdc13537300d5b064bd7`, deployed to Review on 2026-08-28. The fix extends every protected pseudonymization, mutation and retention function to TikTok, routes reauthorization cleanup through the platform-generic path, records the actual platform in failure audit, and adds a prominent main-card progress/failure state with bounded auto-refresh. The final state passed formatting, builds, lint, typecheck, Terraform/release checks, 185 unit tests, contract/i18n/site checks, all 29 migrations and six integration suites including the new TikTok lifecycle regression, eight platform E2E journeys, seven website E2E journeys, operations/backup-restore/security checks and Secret scan. Review resolves to the exact commit; HTTPS health returns `200` with `noindex`, Platform/PostgreSQL are healthy, Worker and website are running with zero restarts, and both maintenance timers are active.
  - Disconnect/revoke/delete Human E2E: PASS. The first historical observation used one protected administrator retry wake and is retained only as failure-discovery context. The independent follow-up operation `0fbac636-898a-4cd9-8bf2-7faf26793549` entered its scheduled `lifecycle_cleanup_pending` retry, remained due for `2026-08-28 07:27:45.755 UTC`, and was claimed by the Worker for attempt 2 without an administrator or database intervention. It completed automatically at `2026-08-28 07:27:45.868 UTC`; `load_authorization`, `provider_revoke` and `local_authorized_data_delete` all completed, and the Channel is `disconnected` with account identity, scopes, consent, authorization subject, token reference and envelope ciphertext absent. The prior private execution remains immutable and no reconnect, second publish or duplicate execution was used to obtain this evidence.
  - Acceptance Review: FAIL on 2026-08-28 against AC-08, AC-10 and AC-12. Blocking findings: user-facing `R4`/`Pilot` wording violated the formal-product presentation authority; TikTok durable App, processor/data-flow/retention/deletion and bilingual legal/versioned-consent facts were absent from their current owners; the final lifecycle/deployment state had no attributable final Code Review; and the live closure observation included the administrator retry wake described above. Public Registry truth remained `Coming Soon` / `production_available: false`, and no out-of-scope product, Scope, second publish or external submission was found.
  - Acceptance remediation: PASS and deployed on 2026-08-28. It removes internal stage/pilot wording, adds a release regression gate, reconciles Architecture and Security/Data authority, adds bilingual TikTok Privacy/Terms/Data Deletion disclosure, advances the policy/consent version to `2026-08-28`, classifies successful two-phase disconnect outcomes as in-progress until the server reaches its terminal state, and keeps the migration image non-root by default. The final candidate `e2c015b82b25eb788a3fca209badc0f89a3f9753` passed `pnpm verify`: formatting, lint, typecheck, production builds, Terraform and release checks, 203 unit tests, contracts, 629-key bilingual catalog parity, localized site checks, all 29 clean/forward migrations and all database integration suites, eight platform E2E journeys, seven website E2E journeys, operations/backup-restore controls and Secret scan. The production dependency audit reports one moderate advisory below the blocking `high` threshold. Final Code Review found no open P1/P2 finding. Protected CI run `33154279952` passed the same commit, including the container configuration scan and complete verification. Production website workflow run `33154699475` deployed that immutable release; independent production smoke passed all 19 HTTPS routes, bilingual legal pages expose version `2026-08-28`, required security headers and exact Sign in links are present, and the site runtime has zero restarts. Review remains on remediation release `9fc8e2522322227c3ad57f009f719ddda8445851`, healthy, `noindex`, zero-restart and with both maintenance timers active. The later Acceptance Review re-run and its new findings are recorded below.
  - Acceptance Review re-run: FAIL on 2026-08-28. AC-10 automatic cleanup, prior presentation/legal remediation, public Registry truth and R5 deferral passed, but the implementation called `GET /v2/user/info/` outside the Human-approved endpoint allowlist and the Registry's detailed implementation/Human E2E fields contradicted its current revision note and PLAN evidence.
  - Acceptance re-review remediation: READY FOR ACCEPTANCE REVIEW on implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`. The TikTok provider interface and adapter no longer expose `/v2/user/info/`; OAuth binds the token response `open_id` and uses approved Creator Info for the connected display name; publish/worker identity fences compare the stored or refreshed `open_id`; retention refresh deletes the expiring display snapshot instead of reading an unapproved endpoint; the Review release check enforces the exact approved static TikTok endpoint set; and Registry detailed state is aligned. The first Code Review found one authorization-read regression after display-snapshot deletion and one platform-mismatched test; both were fixed with a nullable snapshot read and a real TikTok retention regression. The final-state `pnpm verify` passed formatting, lint, typecheck, builds, Terraform/release checks, 203 unit tests, contracts, 629-key bilingual catalog parity, site checks, all 29 migrations and database integration suites, eight platform E2E, seven site E2E, operations/backup-restore controls and Secret scan. One moderate production dependency advisory remains below the blocking `high` threshold. The final Code Review rerun found no open P0/P1/P2 finding, and protected CI run `33160273495` passed the exact implementation commit including container-configuration and complete verification.
  - Acceptance re-review deployment: PASS on 2026-08-28. The 404 MB immutable Review archive for `a03133e4188c191d0e70d507cbf654da9c66d8cc` passed local and remote SHA256 validation; its incremental transfer sent approximately 108 MB by reusing deployed layers. Review activation under `change-20260828-r4-endpoint-allowlist` applied zero new migrations with all 29 present, validated image revision labels, Compose/Caddy, HTTPS, `noindex` and health, then recorded the exact release pointer. Independent checks confirmed platform and PostgreSQL healthy, Worker and website running, all four containers at zero restarts, the unapproved endpoint absent from the deployed adapter and platform executable surface, both maintenance timers active and enabled, host/COS capacity within limits, no recent platform/worker error event, Review health `200`/POST `405`, login `200`, and all 19 public HTTPS routes passing. No TikTok reconnect or additional publish was performed.
  - Acceptance Review re-review: PASS on 2026-08-28 against the approved R4 Baseline at repository evidence commit `ab93c4192665454d68d215d97b758e1624b2ce1f` and deployed implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`. AC-08, AC-10 and AC-12 passed; no blocking acceptance finding remains. The unapproved endpoint is absent from the deployed executable surface, the independently scheduled lifecycle retry completed without intervention, historical executions remain immutable without a duplicate publish, and Registry/public truth remains `Coming Soon` / `production_available: false`.
  - Stage Acceptance: PASS for the R4 technical slice on 2026-08-28. The Human Owner instructed checkpoint creation after the Acceptance Review PASS. The checkpoint records technical closure only and does not authorize another publish, reconnection, public `Available`, external audit/App Review submission, R5 execution, merge, push or repository synchronization. Git history owns the checkpoint identity.

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

- Deployment checks: PASS for commit `15213db673cc8ff15357c96d4bba841a1681cc87`.
- Human E2E: PASS, including the automatic abandoned-upload cleanup journey.
- Stage Acceptance: PASS. On 2026-08-25 the Human Owner explicitly instructed the agent to create the checkpoint, synchronize the repository and formally close the current development stage.
- Checkpoint: created by the repository workflow immediately after this acceptance record; Git history owns the checkpoint identity.
- Progression boundary: R2 acceptance permits planning the next Stage but does not approve Facebook Scope, credentials, Developer Console writes, external submission or R3 implementation.

## R3 — Facebook Review Slice

### Scope Approval

- Approved package and provenance: [`decision-inputs/R3_FACEBOOK_SCOPE_APPROVAL.md`](decision-inputs/R3_FACEBOOK_SCOPE_APPROVAL.md)
- Prepared: 2026-08-26 against current official Meta permission, Pages API, upload, callback, Business Verification and App Review sources.
- Approved minimum permission set: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`; `public_profile` is automatic. `publish_video` and all Ads, Insights, Messaging, Metadata/Webhook, Instagram and Threads permissions are explicitly excluded.
- Approved App ownership decision: a company Business Portfolio owns one durable Meta App ID so R3 review evidence is not intentionally discarded at the later infrastructure migration; Review tokens, authorization data, App Secret material, redirect/callback URLs and runtime configuration remain isolated and are revoked/rotated/removed before final-production cutover.
- Scope Approval status: **PASS**. On 2026-08-26 the Human Owner used the package's explicit approval statement and authorized the corresponding Baseline/Registry updates, company Meta App creation/configuration, R3 implementation, and one controlled real Human E2E publish. External App Review submission, public `Available`, checkpoint and synchronization remain excluded.

### Implementation

- 使用当前官方文档冻结 Facebook Page publishing use case、最小 Permission Matrix 和数据流；Human Owner 明确批准后才配置 App。
- 实现 OAuth、目标 Page identity、明确 publish confirmation、真实执行/跟踪、断开/撤销/删除、审计和双语状态。
- 向 R5 输出已实现的 Permission-to-UI、数据流和 Human E2E 证据；Reviewer Account、Instructions、Demo Script/Video 和外部申请材料在统一提交阶段生成。

### Gates

- Scope Approval: required before external credential use.
- Code Review: required.
- Acceptance Review: required.
- Human E2E: required.

## R4 — TikTok Review Slice

### Implementation

- 按批准的 Web Login Kit + Direct Post Video 边界配置公司 TikTok Organization/App；只启用自动 `user.info.basic` 和申请 Scope `video.publish`，仅使用 `FILE_UPLOAD`。
- 实现 OAuth、fresh Creator Info、无默认 Privacy、未审核期手动 `SELF_ONLY`、交互/商业内容/AI 披露与 policy consent、immutable confirmation、真实结果、断开/撤销/删除、审计和双语状态。
- 向 R5 输出已实现的 Scope-to-UI、数据流和 Human E2E 证据；Reviewer Account、Instructions、Demo Script/Video 和外部申请材料在统一提交阶段生成。

### Scope Approval

- Decision package: [`decision-inputs/R4_TIKTOK_SCOPE_APPROVAL.md`](decision-inputs/R4_TIKTOK_SCOPE_APPROVAL.md)
- Prepared: 2026-08-27 against current official TikTok Login Kit, Content Posting API, Content Sharing, token management, Sandbox and App Review sources.
- Status: **APPROVED 2026-08-27**. Company TikTok Organization/App configuration, exact approved Scope, R4 implementation and one controlled private Human E2E are authorized. External audit/App Review, public availability, checkpoint and repository synchronization are not authorized.

### Gates

- Scope Approval: PASS on 2026-08-27.
- Self Verification: PASS on 2026-08-28 for implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`. The complete local `pnpm verify` passed, including 203 unit tests, every database integration suite, eight platform E2E and seven site E2E; no blocking dependency or secret finding remains. Protected CI run `33160273495` passed the exact commit.
- Code Review: PASS on the final rerun for implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`. The first run found one P1 authorization-read regression after TikTok display-snapshot deletion and one P2 platform-mismatched retention test; both were fixed, the final-state `pnpm verify` passed, and the rerun found no open P0/P1/P2 finding. The prior review through `e2c015b82b25eb788a3fca209badc0f89a3f9753` remains historical evidence only.
- Acceptance Review: PASS on the final 2026-08-28 re-review at repository evidence commit `ab93c4192665454d68d215d97b758e1624b2ce1f` and deployed implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`. AC-08, AC-10 and AC-12 passed with no blocking finding. Earlier FAIL results remain historical evidence of the remediated presentation/legal, automatic-cleanup, endpoint-boundary and Registry findings.
- Human E2E: PASS. One controlled private `SELF_ONLY` Direct Post completed without duplication, and operation `0fbac636-898a-4cd9-8bf2-7faf26793549` independently completed the disconnect/revoke/authorized-data cleanup path on its scheduled Worker retry without a database intervention. No reconnection or additional publish was performed.
- Stage Acceptance: PASS for the R4 technical slice on 2026-08-28. The Human Owner instructed checkpoint creation after the Acceptance Review PASS; Git history owns the checkpoint identity. Reconnection, another external write, external submission, public availability, R5 execution, merge, push and repository synchronization remain separately gated.

## R5 — Submission Readiness and Closure

### Implementation

- 执行官网、review SaaS、tenant/RBAC、upload/approve/publish/track/revoke/delete、双语/移动端、安全和备份恢复全量回归。
- 执行 release-truth content audit，确认外部页面不含内部环境或 Delivery 术语，同时没有把 `Coming Soon`、私密上传、Schedule、账号访问或安全限制扩大为不可证实的可用状态。
- 确认 Facebook/TikTok Registry 仍与真实 production state 一致；记录 `submission_ready` 或实际外部状态但不把第三方批准写成 Acceptance。
- 为 Facebook 和 TikTok 分别完成 Reviewer Account、Instructions、Scope/Permission-to-UI trace、Data Flow/Retention/Deletion、支持联系人和完整 E2E Demo Script/Video，并核对实际 App 配置。
- 在另行授权下执行各平台独立的 Business/Domain Verification、Advanced Access/Audit 和外部 App Review；统一阶段只合并项目执行窗口，不把这些平台外部流程合并成一个申请或一个状态。
- 输出受保护的 reviewer handoff checklist 和 review 环境 teardown/migration checklist。

### Gates

- Final Acceptance Review: required.
- Human E2E: required.
- Stage Acceptance: required.
- Checkpoint requires separate Human Owner approval.
