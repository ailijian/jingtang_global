# JINGTANG Security and Data Authority

- Status: Approved
- Security/Data Revision: 21
- Effective Date: 2026-08-25
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Owner: JINGTANG Security/Data Owner
- Architecture dependency: [`docs/architecture/README.md`](../architecture/README.md)
- Upstream product authority: [`BASELINE.md`](../deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Approved Revision 2

## Authority Boundary

This document owns the current data classification, data-flow map, regional and processor boundary, retention/deletion defaults, encryption and backup requirements, and security control obligations. D6 repository evidence verifies the implemented lifecycle controls; R2 owns observed evidence for the current time-bounded Seoul service, while D7 continues to own final-production Tencent Cloud proof. Any longer retention, new processor, new region, new data purpose, or weaker deletion path requires Security/Data Owner approval and a public disclosure review.

It does not own Delivery requirements, UX semantics, legal text, public security claims, infrastructure implementation, or platform capability status. Product copy is never evidence that a control exists.

## Data Classification

| Class | Examples | Required handling |
| --- | --- | --- |
| Public | Website copy, published legal pages, public integration status | Integrity-controlled; may be globally cached |
| Internal | Source code, non-secret configuration, synthetic test fixtures | Authenticated team access; no production data |
| Confidential | User profile, business email, Workspace/member data, content metadata, audit records, support messages | Tenant-bound access, TLS, KMS at rest, redacted logs |
| Restricted | OAuth tokens/codes, session secrets, password-reset artifacts, user-owned source assets, private/unpublished platform data, production secrets, protected infrastructure state containing one-use bootstrap credentials | Least privilege, private network/storage, encryption at rest, envelope encryption where specified, never ordinary logs |

Production data is prohibited in local development, CI fixtures, screenshots, demo recordings, or reviewer evidence unless explicitly minimized, authorized, and stored in the protected reviewer environment.

## Regional and Processor Boundary

| Processor/system | Purpose | Data/region decision |
| --- | --- | --- |
| Tencent Cloud Seoul (`ap-seoul`) | SaaS compute, TencentDB for PostgreSQL, private COS data and KMS-sealed secret buckets, TDMQ, KMS, SES, CLS/Cloud Monitor, backups | Primary production application data and compute remain in Seoul; the D3 public website and D7 SaaS data plane are separate resources, and integration/production use separate logical resources and credentials |
| Tencent Cloud CIAM | Sign-up, login, logout, password reset and credential policy | The production tenant is not yet provisioned. D7 must capture the selected tenant's contractual processing location and console configuration as protected evidence, and public disclosure must match that evidence before production access |
| Tencent Cloud Lighthouse (Seoul), GoDaddy DNS, and Let's Encrypt ACME | Public website static delivery, current account-controlled SaaS compute/local PostgreSQL, DNS, TLS certificate issuance/renewal, and bounded security/access logs | Website and SaaS share only the physical host and TLS ingress. Their containers, networks, volumes, configuration, logs and release paths remain isolated; the website itself receives no authenticated API data, user content, OAuth token or application secret |
| Tencent Cloud COS (Seoul) review storage | Current account-controlled SaaS source assets and encrypted PostgreSQL backups | Private, prefix-scoped storage with short-lived signed upload, SSE-COS, version/lifecycle controls and least-privilege role credentials; no public objects |
| Google/YouTube | User-directed OAuth, channel identification, video upload, status tracking, revocation | Google processes data under its platform terms and global infrastructure after explicit user action |
| GitHub | Source repository and Actions CI | Source code and synthetic fixtures only; no production data or long-lived cloud key |
| User mail provider | Invitation, password/identity, security, support messages | Minimum message content; no OAuth token, source asset, or unpublished post body |

Adding analytics, CRM, customer support, error-reporting, CDN, AI, or marketing processors is not pre-approved. A new processor requires a data-flow/retention update before integration.

## Initial Data Flow Map

| ID | Flow | Data | Storage/processing | Recipient | Deletion/control |
| --- | --- | --- | --- | --- | --- |
| DF-01 | Register/login/reset and locale preference | Email, name, CIAM subject, session metadata, `en`/`zh-CN` preference, consent version/time and displayed locale | Tencent CIAM + tenant-bound TencentDB profile; server-only secure session | Tencent Cloud; transactional email path through Tencent Cloud SES | Logout revokes session; account deletion disables access first, then deletes/pseudonymizes profile and locale preference per matrix |
| DF-02 | Workspace/team | Workspace profile, invitations, membership, role | TencentDB under `workspace_id` with application checks + RLS | Invited recipient receives minimum invite context | Owner/Admin controls membership; expired invites purge automatically |
| DF-03 | Source asset upload | User-owned media, MIME/size/hash, object key | Direct signed upload to private COS; malware/type validation worker; TencentDB metadata | Tencent Cloud only until explicit platform publish | User/workspace deletion deny-marks immediately; objects and keys purge per matrix |
| DF-04 | Content and approval | Internal content metadata, platform versions, review comment, revision/hash, actors | TencentDB; platform fields stay tenant-bound | Workspace-authorized members | Role checks; deletion and retention per matrix |
| DF-05 | YouTube connect | OAuth state/PKCE, code, access/refresh token, scope, Google/YouTube channel ID and display metadata | Code exchanged at BFF; staging/production tokens are envelope-encrypted with Tencent KMS; the approved time-bounded Review exception uses host-local `local:v2`; channel metadata is stored in the environment-owned database | Google/YouTube | Cancel starts no OAuth; disconnect deny-marks, revokes, cryptographically erases token, then cleans Authorized Data |
| DF-06 | Confirm/publish | Approved asset/version snapshot, title, description, privacy/audience settings, channel, actor, confirmation time | Immutable intent and per-channel execution in TencentDB; TDMQ reference; worker streams media from COS | YouTube only after explicit Publisher confirmation | Worker rechecks authorization/deletion; no silent account/platform expansion; retained API Data refreshes or deletes within policy window |
| DF-07 | Track result | YouTube video ID/URL, publish/processing status, failure category, timestamps | TencentDB execution record; provider payload minimized/redacted | Authorized Workspace users | API-derived values refresh/delete every 30 days; user/revocation deletion paths below |
| DF-08 | Disconnect/delete | Requester, target, reason code, timestamps, revocation result, cleanup operations | Deny marker + protected lifecycle/deletion ledgers in TencentDB; worker-only cleanup | Google revocation endpoint when applicable | New API calls stop before cleanup; token revocation is attempted immediately; retry backoff is bounded but the operation remains durable until completion |
| DF-09 | Audit/telemetry | Account or Workspace actor/action/target/result/time, correlation IDs, safe error codes, infrastructure signals | Append-only tenant audit for Workspace actions; separate append-only global account audit for login/logout/locale/account deletion; restricted Tencent CLS/Cloud Monitor telemetry | Authorized Workspace Activity receives only tenant actions; global account evidence is restricted and is never assigned or fanned out to a Workspace | No token/raw media/final content; identifiers and retention are minimized per matrix |
| DF-10 | Website demo/contact | Business contact details and free-text inquiry | Values remain in the visitor's browser until they explicitly open an email draft to `developer@jingtangai.com`; the resulting message is held in the domain mailbox | JINGTANG support | Notice at collection; no website database or analytics copy; purge inactive inquiry per matrix |

### Temporary review environment profile

The approved Social Platform Developer Review Enablement Delivery permits one time-bounded `review` profile on the existing Seoul Lighthouse. It is not D7 final-production infrastructure, is not approved for public registration, promotion or scaled sales, and cannot support claims about unimplemented final-production controls. Under Baseline Revision 3 it is nevertheless the real current account-controlled product entry point, so public claims may describe only controls observed for this deployed service and must not expose internal Stage/Gate or environment labeling. Review account, Workspace, Content, approval, execution and audit rows use a dedicated local PostgreSQL volume; source assets and encrypted database backups use dedicated prefixes in one private Seoul COS Bucket. OAuth tokens use the `local:v2` application envelope: each connection has an independent data key, its wrapped key lives in a root-only detached store on the protected local persistent volume, and the 256-bit root key is delivered to platform/worker from a `0400` file. Neither local key file is included in database/COS backup; host loss or root-key replacement therefore requires channel reconnection. The separately created OAuth-key COS Bucket remains empty, receives no runtime credential, and may be deleted at review teardown. Static least-privilege COS CAM credentials are permitted only because Lighthouse cannot be assumed to expose the production CVM role credential path. They are supplied through root-managed runtime Secret material: the directory is non-traversable by ordinary host users and each `0400` file is readable only by its dedicated non-login service or database identity. Credentials are scoped to named review resources, excluded from logs/images/Git, and revoked at teardown.

Public registration and self-service reset are disabled. Only pre-created Human Owner and reviewer accounts are permitted. Review source uploads are limited to 500 MiB per object and a 15 GB active soft quota, are sent directly to private COS with short-lived signatures, and never persist on the Lighthouse media filesystem. An initiated upload becomes ineligible for completion after 20 minutes: the worker atomically fail-closes its metadata, records a minimized system audit event, and retries exact-object deletion until COS confirms success. Existing retention/deletion rows below continue to apply; deleting the review Workspace triggers the same deny-first durable cleanup. The public website remains database-free and does not receive review cookies, account data or content.

## Retention Matrix

Periods are maximum defaults from the event shown. “Delete” includes live databases, indexes, object versions, queues, caches, and derived views. Backups are isolated and expire within 35 days; a restore must import and replay protected deletion/lifecycle records occurring after the selected recovery point through current time before any application read.

| Data class | Active retention | Triggered deletion / expiry | Backup treatment |
| --- | --- | --- | --- |
| CIAM identity and active session | While account active; session uses short bounded lifetime | Disable sessions immediately on account deletion; delete identity and live profile within 7 calendar days after authorized request | CIAM/TencentDB recovery copies inaccessible to app; expire ≤35 days |
| Terms/Privacy consent evidence | Account lifetime + 365 days | Pseudonymize user linkage after the evidence period unless a documented dispute hold applies | Expire with ≤35-day backup cycle after live deletion |
| Workspace, membership, and role | While Workspace/account active | Remove membership access immediately; delete/pseudonymize live record within 7 days of authorized account/Workspace deletion, subject only to minimal audit evidence | Expire ≤35 days; restore replays deletion ledger |
| Invitation | Until accepted/revoked or 30 days, whichever comes first | Purge expired/revoked token and unnecessary recipient data within 7 days | Expire ≤35 days |
| Source asset, Content, platform versions, approval comments | While user keeps the item/Workspace active | Deny access immediately and delete live data/objects within 7 days of authorized deletion; no implicit third-party deletion | Per-object data key destruction for restricted objects; residual encrypted backup expires ≤35 days |
| Publishing intent (first-party evidence) | While Content/Workspace active, then up to 365 days for dispute/audit evidence | Remove content payload within 7 days of deletion; retain only minimized, pseudonymized action evidence | Expire ≤35 days after live purge |
| OAuth authorization code/state | Minutes; only for one callback | Single use or immediate expiry; never persist in ordinary logs | Not backed up |
| OAuth access/refresh token | Only while connection active and needed | On in-product disconnect: deny first, programmatically revoke immediately, delete wrapped data key/token live record immediately; failed revoke retries without re-enabling access | Per-connection key deletion makes backup ciphertext unusable; backup expires ≤35 days |
| YouTube Authorized/API Data, including channel metadata and platform ID/status | No more than 30 calendar days without refresh while consent remains active | In-product revoke or user deletion: delete live Authorized Data as soon as possible and within 7 days. Externally revoked/unrefreshable authorization: detect by scheduled validity check and delete no later than 30 days | Encrypted isolated backups; deletion ledger reapplied on restore; expires ≤35 days |
| Tenant and global account audit events | 365 days | Tenant deletion pseudonymizes actor linkage and removes content/provider payload; account deletion retains only hashed/minimized global request/completion facts; neither ledger is reassigned across tenants | Expire ≤35 days after live expiry |
| Application logs/traces | 30 days | Automatic expiry; immediate purge path for discovered secret/Restricted data | No separate application backup |
| Security/access logs | 365 days | Automatic expiry unless documented incident hold; holds are scoped and approved | No separate application backup |
| Queue messages and dead letters | Success + 24 hours; dead letter ≤14 days | Purge on completion/deletion; payload contains opaque references, not tokens/media | No backup |
| Deletion ledger/result | 365 days | Pseudonymized expiry after evidence period | Expire ≤35 days after live expiry |
| Website inquiry | 180 days without an active business relationship | Delete on request or inactivity expiry; do not repurpose without notice/consent | Expire ≤35 days |

The YouTube-specific controls implement the current policy boundary: ordinary Authorized Data is deleted or refreshed within 30 days; an in-product revocation or user deletion cleans applicable Authorized Data within 7 days; external revocation detected through token validity must be cleaned within the applicable 30-day maximum. D6 repository checks verify the jobs and bounded retry; D7 must still verify their deployed schedule and alert routing.

## Encryption and Key Management

- TLS 1.2 or newer is required for browser, API, internal service, database, queue, email API, and provider traffic.
- TencentDB, COS, TDMQ, CLS, and backups use customer-managed or service KMS encryption appropriate to the service, with separate production/integration keys. Private COS writers inherit the infrastructure-owned KMS bucket default and do not override it with object-level AES256.
- OAuth tokens use application-level envelope encryption in addition to database encryption. Staging/production generate a unique data key per connection and bind its wrapped form to an exact versioned COS object reference under Tencent KMS; the lifecycle/publishing worker destroys that exact version idempotently. The time-bounded review exception uses the same unique-key and durable retirement semantics through `local:v2`, but keeps wrapped per-connection keys in its non-backed-up protected host store. Replacing or clearing an envelope atomically persists the old key reference before destruction, so live and backup token ciphertext becomes unusable after retirement without leaving a recoverable review key in COS.
- Source assets use private COS objects and short-lived signed requests. Object keys are opaque and contain no email, Workspace name, or original filename.
- Runtime secrets rotate as application-level KMS-sealed bundles in a dedicated private, versioned COS secret bucket in Seoul. Protected operators may write immutable bundle versions; runtime roles may read only the named objects and use only the dedicated decrypt key. GitHub uses short-lived federation where supported. Active runtime secrets must never enter Terraform state, source control, CI artifact, browser configuration, container image, ordinary environment artifact, log, trace, audit metadata, error message, screenshot, or demo video. TencentDB and TDMQ resource creation require one-use bootstrap passwords; those values are the sole Terraform-state exception, remain only in encrypted/private least-privilege remote state or an explicitly authorized ephemeral plan, and are invalidated immediately after provisioning before active credentials are sealed into role-specific runtime bundles.
- Key administration, application decryption, and security audit permissions are separate IAM roles. Production humans have no standing token-decryption permission.

## Backup, Restore, and Deletion Safety

- TencentDB for PostgreSQL uses the selected high-availability mode, point-in-time recovery, and encrypted automated backups retained for 35 days in Seoul.
- COS uses versioning and lifecycle expiry. Database and object-store recovery points are reconciled by object hash and deletion ledger.
- A quarterly restore exercise begins in D6. Restores occur into an isolated environment, import protected deletion/lifecycle records from after the selected recovery point through current time, replay them before application access, validate tenant/RLS policy, and only then may replace service state.
- Deletion-ledger rows are retained records: the runtime database role cannot delete them, completed rows and core request facts are database-enforced immutable, and lifecycle transitions are checked against the Workspace deletion state. Recovery replay uses separate administrator-only functions that are not executable by the application role.
- Disconnect and deletion are sagas with durable steps: deny new work → cancel/reject queued work → revoke provider token → erase token key → delete applicable Authorized Data/assets → record minimized result.
- A failed external revocation never restores local access. It receives durable worker retries while the local connection stays denied; at the seven-day deadline JINGTANG-held token and Authorized Data are erased even if the provider remains unavailable, and the unresolved provider outcome is escalated without retaining the token. D7 owns production alert routing.

## Access, Audit, and Observability Controls

- Application roles are deny-by-default and tenant-scoped. The BFF and worker use separate non-superuser database roles: the BFF can request lifecycle work but cannot claim it or execute cleanup/pseudonymization functions; the worker can perform only the granted lifecycle and publishing operations. Production infrastructure roles use least privilege, MFA, short sessions, and recorded reason/ticket context.
- Audit events include user, Workspace, action, target, timestamp, result, correlation ID, and only necessary safe technical metadata.
- Security alerts cover authentication abuse, RLS/authorization denials, secret-access anomalies, queue dead letters, repeated provider failures, deletion SLA risk, and backup/restore failure.
- Redaction tests and canary secret tests are blocking repository checks. D7 verifies production alert routing and incident response evidence.
- Public Security, Privacy, Terms, Data Deletion, and Integration pages may claim only controls evidenced in the currently accessible deployed service. They must not imply D7 final-production infrastructure, certification or integration availability that has not been verified.

## External Policy Trace

Verified 2026-08-21 against current official sources:

- [Google OAuth production policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance): separate test/production projects, accurate identity, minimal scopes, owned/verified domains, public homepage, HTTPS origins/redirects, and verification where required.
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies): user control, privacy notice/consent, programmatic revocation, Authorized/API Data refresh/deletion, user deletion, credential prohibition, and minimum-functionality obligations.
- [YouTube `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert): upload contract, minimum upload scope options, metadata fields, quota, and private-viewing restriction for uploads from qualifying unverified projects.
- [Google OAuth scope catalog](https://developers.google.com/identity/protocols/oauth2/scopes#youtube): current YouTube Data API scope descriptions.

Official policies are external state. The YouTube Integration Owner must re-verify them immediately before D5 implementation, Developer Review submission, and production release.

## Evidence Boundary

D6 verifies user revocation/deletion, retention jobs, audit minimization, tenant controls, secret/log checks, and the disposable restore procedure in repository-controlled environments. R2 owns observed evidence for the separately deployed Lighthouse/PostgreSQL/COS service, and [`docs/OPERATIONS.md`](../OPERATIONS.md) owns its procedures and evidence routing. Tencent IAM, KMS-sealed COS secret bundles, TencentDB/COS backups, CLS/Cloud Monitor alert routing, final-production access records, CIAM tenant/processing-location evidence, and an isolated final-production restore exercise remain D7 evidence and must not be described as current controls before verification.

## Revision Record

- Revision 2 — 2026-08-20：随 Human Owner 授权的 Baseline Revision 2 增加 locale preference 与 Consent displayed locale 数据字段；未增加处理方、区域、数据用途或更长保留期，Revision 1 的安全与删除边界保持不变。
- Revision 3 — 2026-08-21：D3 选择域名邮箱作为官网 Contact/Demo 的明确联系路径。表单只在浏览器内准备邮件内容，访客明确打开邮件草稿后由其邮件提供商发送至 `developer@jingtangai.com`；不新增网站数据库、Analytics、CRM、处理方、数据用途或更长保留期。
- Revision 4 — 2026-08-21：Human Owner 将 D3 公共官网生产目标明确为腾讯云首尔轻量应用服务器；增加腾讯云、GoDaddy DNS 与 Let's Encrypt ACME 的公开静态资源、TLS 和有限安全/访问日志处理边界。官网仍不处理账号数据、用户内容、OAuth Token 或应用 Secret；Human Owner 已明确批准更新后的中英双语 Legal/Data Disclosure，并授权 production-candidate commit 与公开 rollout。
- Revision 5 — 2026-08-21：Human Owner 在 D5 前明确批准把尚未实施的 SaaS/worker AWS 架构修订为腾讯云，并选择不单独准备测试服务器。当时的文档机械保留了 D0 的腾讯云新加坡假设；该地域推断已由 Revision 13 正式纠正并取代。Test/Integration 的数据库、COS Bucket、TDMQ Queue、KMS Key、Secret、Log 与 Google Cloud Test Project 隔离要求继续有效。本修订未创建任何腾讯 SaaS 资源，也未改变已验收的腾讯云首尔静态官网边界。
- Revision 6 — 2026-08-22：Human Owner 授权按 D5 re-review 的最小修正实施治理。受保护本地 D5 harness 可使用 Google Cloud Test Project、allow-listed Human account 与用户自有测试素材证明真实 OAuth/私密上传；其数据库、对象存储、本地 envelope key 和 PostgreSQL outbox 仅是 test evidence，不得复用 production credential、不得标记 Available，也不替代 D7 的腾讯云 deployed CIAM、TencentDB、COS、TDMQ、KMS/secret storage、CLS/Cloud Monitor 和生产访问控制证据。Revision 13 取代了本记录中继承的新加坡地域假设。
- Revision 7 — 2026-08-22：D6 实现并以受控测试验证 Disconnect deny-first、Google programmatic revoke、Token/Authorized Data 清理、Workspace 删除申请台账、7/30 天 retention clock、审计载荷匿名化与 restore drill；生产腾讯云控制证据仍明确归 D7，未新增处理方、区域、用途或更长保留期。
- Revision 8 — 2026-08-22：Human Owner 同意 D6 Acceptance Review 的最小修正。Disconnect 改为持久化重试并在第七天强制清除 JINGTANG 保存的 Token/Authorized Data；Workspace 删除失败保持 `deletion_pending`、普通访问持续阻断并由幂等 worker 自动重试，不再恢复为 Active。本修订不改变处理方、区域、用途或保留期。
- Revision 9 — 2026-08-22：D6 Code Review 修正确保断开、授权失效与 30 天过期路径同步清除发布快照中的频道标识；Workspace 删除到达第七天时，本地数据库、会话、Token 与 Authorized Data 清理不再受临时 COS 故障阻塞，未删除对象仅以不含用户内容的 opaque key 留在删除台账并持续重试。本修订未扩大处理方、区域、用途或保留期。
- Revision 10 — 2026-08-22：D6 收口修复为尚无 Workspace 的身份事件增加用户隔离的不可改写待归属记录，并在首个真实 Workspace 创建时保留原始时间与关联 ID 原子回放；曾属于 Workspace 的用户继续以最后一个真实 Workspace 作为最小历史审计范围。补充 Google 撤销成功判定、COS 请求超时与独立 lifecycle loop 控制；未新增处理方、区域、用途或更长保留期。
- Revision 11 — 2026-08-23：D6 正式 Code Review 将删除台账的 365 天留存边界下沉为数据库约束：运行角色不得删除台账、不得改写已完成记录或核心请求事实，状态转换必须匹配 Workspace 删除生命周期；灾备恢复改用不授予应用角色的独立管理员函数，历史完成记录不再能授权在线应用清理或审计伪匿名化。本修订未新增处理方、区域、用途或更长保留期。
- Revision 12 — 2026-08-23：D6 收口统一为数据库驱动的 lifecycle control plane：BFF 只持久化 deny/request，worker 通过数据库时间、租约与递增 generation 执行并防止 stale worker 写入；合规 SLA 超期只触发升级而不会放弃清理。账号级事件迁移到独立全局 append-only audit，不再归属任一 Workspace；恢复演练明确导入并回放恢复点之后至当前的受保护删除台账。本修订未新增处理方、区域、用途或更长保留期。
- Revision 13 — 2026-08-24：Human Owner 确认真实腾讯生产位置为首尔并正式授权纠正。SaaS 主要应用数据与计算的目标区域改为 `ap-seoul`；D3 官网与 D7 SaaS 数据面位于同一区域但保持独立资源边界。官方区域资料确认 CVM/AZ、TencentDB、COS/KMS 与 TDMQ RabbitMQ 的首尔路径，而腾讯云国际站 Secrets Manager 当前 API 地域清单不含首尔，因此运行时 Secret 改为首尔私有 COS 中的 KMS 信封加密、版本化 sealed bundle；CIAM 的具体处理位置须由 D7 生产 tenant/合同证据确认后再公开。本修订未执行外部写入、未声称 D7 资源已创建，也未扩大用途或保留期。
- Revision 14 — 2026-08-24：D7 生产候选将 YouTube OAuth callback 从 Caddy access log 中明确排除，避免 query 中的单次 authorization code 与 state 进入普通日志；部署工作流增加公开 Legal/Data 生产状态门禁、D7 schema readiness 与整套 release configuration rollback。该修订仅收紧既有 Restricted 数据和发布控制，未执行生产写入、未新增处理方/用途/区域或延长保留期。
- Revision 15 — 2026-08-24：D7 生产候选统一继承 Terraform 管理的 COS KMS Bucket 默认加密，禁止对象写入以 AES256 覆盖 KMS；OAuth 每连接包裹密钥绑定并精确删除其 COS VersionId，避免版本化 Bucket 的普通删除标记保留可恢复密钥。该修订落实既有密码学擦除义务，未执行生产写入、未新增处理方/用途/区域或延长保留期。
- Revision 16 — 2026-08-24：纠正 Terraform state 的安全声明。TencentDB/TDMQ provider 在创建资源时要求一次性 bootstrap password，因此这些失效前的初始值会进入敏感 Terraform state；D7 配置强制 COS backend 私有 ACL 与服务端加密，并要求专用、版本化、最小权限远程 state、受控临时 plan 和创建后立即轮换。活动运行时 Secret 仍禁止进入 Terraform、Git、镜像、日志或普通部署产物。本修订未执行生产写入，也未新增用途、处理方、区域或保留期。
- Revision 17 — 2026-08-24：Human Owner 明确批准在既有腾讯云首尔 Lighthouse 与新购 20 GB COS 上建立限时、非销售用途的 Social Platform Developer Review 环境，同时要求真实 production server requirements 保持不变。本修订增加独立 review PostgreSQL/COS/KMS/CAM/OAuth/备份边界、预创建审核账号、500 MiB 单对象和 15 GB 活跃素材软配额，以及 teardown credential/data cleanup；未新增区域或处理方，未放宽既有用途、撤销、删除或保留义务，且不构成 D7 production evidence。
- Revision 18 — 2026-08-24：R1 实现收紧了临时 review 主机 Secret 边界：普通 SSH 操作员 UID 不再与容器共享，root 管理不可遍历的 Secret 目录，`0400` 文件仅由专用非登录 service/database identity 读取；Caddy 同时覆盖上游客户端 IP 头后再执行应用限流。本修订是对已批准 root-only 意图的可执行实现说明，未扩大凭证可见范围、用途、处理方、区域或保留期，也未执行云端写入。
- Revision 19 — 2026-08-24：腾讯 KMS 被确认需要购买付费实例后，Human Owner 明确批准临时 Review 使用本地 envelope key、正式 production 继续使用 KMS。Review 改为 `local:v2` 每连接独立数据密钥、root-only 256-bit 根密钥和不进入备份的本机 detached key store；丢失或轮换根密钥须重新连接渠道。此前创建的 OAuth-key COS Bucket 不授予运行时权限并保持为空，可在 teardown 删除。本修订没有削弱 staging/production KMS、sealed bundle、CAM、地域或密码学擦除义务，也未新增处理方、用途、区域或保留期。
- Revision 20 — 2026-08-25：R2 首尔真实上传验证确认 platform 在完成直传时必须以 `HeadObject` 校验 COS 对象，并暴露了一条失败请求遗留的未认领对象。Review 现将发起后 20 分钟仍未完成的上传原子 fail-close，由 worker 持久重试精确对象删除并记录最小化系统审计；CAM 模板与发布门禁同步固化 `HeadObject`。本修订未新增处理方、用途、区域或更长保留期。
- Revision 21 — 2026-08-25：Human Owner 明确批准 Social Platform Review Baseline Revision 3。当前首尔部署仍不是 D7 最终生产基础设施，也不开放自助注册、推广或规模化销售；但它成为官网指向的真实账号受控产品入口。公开 Security/Legal 只可描述 R2 已观察的当前服务事实，不再暴露内部 Stage/Gate 或测试环境标签，也不得把未来 TencentDB/TDMQ/KMS/CIAM/CLS 架构误述为当前控制。本修订未新增处理方、用途、区域、数据类型或更长保留期。
