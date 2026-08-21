# JINGTANG Security and Data Authority

- Status: Approved
- Security/Data Revision: 4
- Effective Date: 2026-08-21
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Owner: JINGTANG Security/Data Owner
- Architecture dependency: [`docs/architecture/README.md`](../architecture/README.md)
- Upstream product authority: [`BASELINE.md`](../deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Approved Revision 2

## Authority Boundary

This document owns the current data classification, data-flow map, regional and processor boundary, retention/deletion defaults, encryption and backup requirements, and security control obligations. D6 must replace initial evidence states with verified production evidence and may shorten retention after legal review. Any longer retention, new processor, new region, new data purpose, or weaker deletion path requires Security/Data Owner approval and a public disclosure review.

It does not own Delivery requirements, UX semantics, legal text, public security claims, infrastructure implementation, or platform capability status. Product copy is never evidence that a control exists.

## Data Classification

| Class | Examples | Required handling |
| --- | --- | --- |
| Public | Website copy, published legal pages, public integration status | Integrity-controlled; may be globally cached |
| Internal | Source code, non-secret configuration, synthetic test fixtures | Authenticated team access; no production data |
| Confidential | User profile, business email, Workspace/member data, content metadata, audit records, support messages | Tenant-bound access, TLS, KMS at rest, redacted logs |
| Restricted | OAuth tokens/codes, session secrets, password-reset artifacts, user-owned source assets, private/unpublished platform data, production secrets | Least privilege, private network/storage, envelope encryption where specified, never ordinary logs |

Production data is prohibited in local development, CI fixtures, screenshots, demo recordings, or reviewer evidence unless explicitly minimized, authorized, and stored in the protected reviewer environment.

## Regional and Processor Boundary

| Processor/system | Purpose | Data/region decision |
| --- | --- | --- |
| AWS Singapore (`ap-southeast-1`) | SaaS compute, Cognito identity, RDS, S3, SQS, KMS, Secrets Manager, SES, CloudWatch, backups | Primary production application data remains in Singapore; Multi-AZ and backups remain in-region |
| Tencent Cloud Lighthouse (Seoul), GoDaddy DNS, and Let's Encrypt ACME | D3 public website static delivery, DNS, TLS certificate issuance/renewal, and bounded security/access logs | Public website assets plus limited request/security metadata only; no authenticated API data, user content, OAuth token, or application secret is processed on this host |
| Google/YouTube | User-directed OAuth, channel identification, video upload, status tracking, revocation | Google processes data under its platform terms and global infrastructure after explicit user action |
| GitHub | Source repository and Actions CI | Source code and synthetic fixtures only; no production data or long-lived cloud key |
| User mail provider | Invitation, password/identity, security, support messages | Minimum message content; no OAuth token, source asset, or unpublished post body |

Adding analytics, CRM, customer support, error-reporting, CDN, AI, or marketing processors is not pre-approved. A new processor requires a data-flow/retention update before integration.

## Initial Data Flow Map

| ID | Flow | Data | Storage/processing | Recipient | Deletion/control |
| --- | --- | --- | --- | --- | --- |
| DF-01 | Register/login/reset and locale preference | Email, name, Cognito subject, session metadata, `en`/`zh-CN` preference, consent version/time and displayed locale | Cognito + tenant-bound RDS profile; server-only secure session | AWS; transactional email provider path through SES | Logout revokes session; account deletion disables access first, then deletes/pseudonymizes profile and locale preference per matrix |
| DF-02 | Workspace/team | Workspace profile, invitations, membership, role | RDS under `workspace_id` with application checks + RLS | Invited recipient receives minimum invite context | Owner/Admin controls membership; expired invites purge automatically |
| DF-03 | Source asset upload | User-owned media, MIME/size/hash, object key | Direct signed upload to private S3; malware/type validation worker; RDS metadata | AWS only until explicit platform publish | User/workspace deletion deny-marks immediately; objects and keys purge per matrix |
| DF-04 | Content and approval | Internal content metadata, platform versions, review comment, revision/hash, actors | RDS; platform fields stay tenant-bound | Workspace-authorized members | Role checks; deletion and retention per matrix |
| DF-05 | YouTube connect | OAuth state/PKCE, code, access/refresh token, scope, Google/YouTube channel ID and display metadata | Code exchanged at BFF; token envelope-encrypted; channel metadata in RDS | Google/YouTube | Cancel starts no OAuth; disconnect deny-marks, revokes, cryptographically erases token, then cleans Authorized Data |
| DF-06 | Confirm/publish | Approved asset/version snapshot, title, description, privacy/audience settings, channel, actor, confirmation time | Immutable intent and per-channel execution in RDS; SQS reference; worker streams media from S3 | YouTube only after explicit Publisher confirmation | Worker rechecks authorization/deletion; no silent account/platform expansion; retained API Data refreshes or deletes within policy window |
| DF-07 | Track result | YouTube video ID/URL, publish/processing status, failure category, timestamps | RDS execution record; provider payload minimized/redacted | Authorized Workspace users | API-derived values refresh/delete every 30 days; user/revocation deletion paths below |
| DF-08 | Disconnect/delete | Requester, target, reason code, timestamps, revocation result, cleanup jobs | Deny marker + audit/deletion ledger in RDS; worker cleanup | Google revocation endpoint when applicable | New API calls stop before cleanup; token revocation is immediate attempt; retry is bounded and observable |
| DF-09 | Audit/telemetry | Actor/workspace/action/target/result/time, correlation IDs, safe error codes, infrastructure signals | Append-only audit table and restricted CloudWatch logs/metrics | Authorized Workspace Activity view; restricted operators | No token/raw media/final content; retention and pseudonymization per matrix |
| DF-10 | Website demo/contact | Business contact details and free-text inquiry | Values remain in the visitor's browser until they explicitly open an email draft to `developer@jingtangai.com`; the resulting message is held in the domain mailbox | JINGTANG support | Notice at collection; no website database or analytics copy; purge inactive inquiry per matrix |

## Retention Matrix

Periods are maximum defaults from the event shown. “Delete” includes live databases, indexes, object versions, queues, caches, and derived views. Backups are isolated and expire within 35 days; a restore must replay the deletion ledger before serving traffic.

| Data class | Active retention | Triggered deletion / expiry | Backup treatment |
| --- | --- | --- | --- |
| Cognito identity and active session | While account active; session uses short bounded lifetime | Disable sessions immediately on account deletion; delete identity and live profile within 7 calendar days after authorized request | Cognito/RDS recovery copies inaccessible to app; expire ≤35 days |
| Terms/Privacy consent evidence | Account lifetime + 365 days | Pseudonymize user linkage after the evidence period unless a documented dispute hold applies | Expire with ≤35-day backup cycle after live deletion |
| Workspace, membership, and role | While Workspace/account active | Remove membership access immediately; delete/pseudonymize live record within 7 days of authorized account/Workspace deletion, subject only to minimal audit evidence | Expire ≤35 days; restore replays deletion ledger |
| Invitation | Until accepted/revoked or 30 days, whichever comes first | Purge expired/revoked token and unnecessary recipient data within 7 days | Expire ≤35 days |
| Source asset, Content, platform versions, approval comments | While user keeps the item/Workspace active | Deny access immediately and delete live data/objects within 7 days of authorized deletion; no implicit third-party deletion | Per-object data key destruction for restricted objects; residual encrypted backup expires ≤35 days |
| Publishing intent (first-party evidence) | While Content/Workspace active, then up to 365 days for dispute/audit evidence | Remove content payload within 7 days of deletion; retain only minimized, pseudonymized action evidence | Expire ≤35 days after live purge |
| OAuth authorization code/state | Minutes; only for one callback | Single use or immediate expiry; never persist in ordinary logs | Not backed up |
| OAuth access/refresh token | Only while connection active and needed | On in-product disconnect: deny first, programmatically revoke immediately, delete wrapped data key/token live record immediately; failed revoke retries without re-enabling access | Per-connection key deletion makes backup ciphertext unusable; backup expires ≤35 days |
| YouTube Authorized/API Data, including channel metadata and platform ID/status | No more than 30 calendar days without refresh while consent remains active | In-product revoke or user deletion: delete live Authorized Data as soon as possible and within 7 days. Externally revoked/unrefreshable authorization: detect by scheduled validity check and delete no later than 30 days | Encrypted isolated backups; deletion ledger reapplied on restore; expires ≤35 days |
| Audit events | 365 days | Pseudonymize deleted user identity and remove content/provider payload; retain deletion/security action facts until expiry | Expire ≤35 days after live expiry |
| Application logs/traces | 30 days | Automatic expiry; immediate purge path for discovered secret/Restricted data | No separate application backup |
| Security/access logs | 365 days | Automatic expiry unless documented incident hold; holds are scoped and approved | No separate application backup |
| Queue messages and dead letters | Success + 24 hours; dead letter ≤14 days | Purge on completion/deletion; payload contains opaque references, not tokens/media | No backup |
| Deletion ledger/result | 365 days | Pseudonymized expiry after evidence period | Expire ≤35 days after live expiry |
| Website inquiry | 180 days without an active business relationship | Delete on request or inactivity expiry; do not repurpose without notice/consent | Expire ≤35 days |

The YouTube-specific controls implement the current policy boundary: ordinary Authorized Data is deleted or refreshed within 30 days; an in-product revocation or user deletion cleans applicable Authorized Data within 7 days; external revocation detected through token validity must be cleaned within the applicable 30-day maximum. D6 must verify the actual jobs and evidence, not only these written limits.

## Encryption and Key Management

- TLS 1.2 or newer is required for browser, API, internal service, database, queue, email API, and provider traffic.
- RDS, S3, SQS, CloudWatch, backups, and Secrets Manager use customer-managed or service KMS encryption appropriate to the service, with separate production/non-production keys.
- OAuth tokens use application-level envelope encryption in addition to database encryption. A unique data key is generated per connection; only the worker and OAuth server role may decrypt it.
- Source assets use private S3 objects and short-lived signed requests. Object keys are opaque and contain no email, Workspace name, or original filename.
- Secrets rotate through Secrets Manager; GitHub uses OIDC. A secret must never enter source control, CI artifact, browser configuration, log, trace, audit metadata, error message, screenshot, or demo video.
- Key administration, application decryption, and security audit permissions are separate IAM roles. Production humans have no standing token-decryption permission.

## Backup, Restore, and Deletion Safety

- RDS uses Multi-AZ, point-in-time recovery, and encrypted automated backups retained for 35 days in Singapore.
- S3 uses versioning and lifecycle expiry. Database and object-store recovery points are reconciled by object hash and deletion ledger.
- A quarterly restore exercise begins in D6. Restores occur into an isolated environment, replay all deletion/deny records through the recovery point, validate tenant/RLS policy, and only then may replace service state.
- Disconnect and deletion are sagas with durable steps: deny new work → cancel/reject queued work → revoke provider token → erase token key → delete applicable Authorized Data/assets → record minimized result.
- A failed external revocation never restores local access. It raises an operator alert and bounded retry while the local connection stays denied.

## Access, Audit, and Observability Controls

- Application roles are deny-by-default and tenant-scoped. Production infrastructure roles use least privilege, MFA, short sessions, and recorded reason/ticket context.
- Audit events include user, Workspace, action, target, timestamp, result, correlation ID, and only necessary safe technical metadata.
- Security alerts cover authentication abuse, RLS/authorization denials, secret-access anomalies, queue dead letters, repeated provider failures, deletion SLA risk, and backup/restore failure.
- Redaction tests and canary secret tests become blocking D2 security checks. D6 verifies production alert routing and incident response.
- Public Security, Privacy, Terms, Data Deletion, and Integration pages may claim only controls evidenced in the production environment.

## External Policy Trace

Verified 2026-08-20 against current official sources:

- [Google OAuth production policy compliance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance): separate test/production projects, accurate identity, minimal scopes, owned/verified domains, public homepage, HTTPS origins/redirects, and verification where required.
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies): user control, privacy notice/consent, programmatic revocation, Authorized/API Data refresh/deletion, user deletion, credential prohibition, and minimum-functionality obligations.
- [YouTube `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert): upload contract, minimum upload scope options, metadata fields, quota, and private-viewing restriction for uploads from qualifying unverified projects.
- [Google OAuth scope catalog](https://developers.google.com/identity/protocols/oauth2/scopes#youtube): current YouTube Data API scope descriptions.

Official policies are external state. The YouTube Integration Owner must re-verify them immediately before D5 implementation, Developer Review submission, and production release.

## D6 Completion Obligations

D6 must replace design-time assertions with observed evidence for processor inventory, actual data paths, field-level data inventory, IAM, encryption, token/key deletion, backup/restore, production access, alerting, incident response, vulnerability management, user revocation/deletion, and all retention jobs. It must also complete legal review of final Terms/Privacy/Data Deletion text and freeze any narrower jurisdictional requirement. No `TBD` may remain in the production Data Flow Map or Retention Matrix at that Gate.

## Revision Record

- Revision 2 — 2026-08-20：随 Human Owner 授权的 Baseline Revision 2 增加 locale preference 与 Consent displayed locale 数据字段；未增加处理方、区域、数据用途或更长保留期，Revision 1 的安全与删除边界保持不变。
- Revision 3 — 2026-08-21：D3 选择域名邮箱作为官网 Contact/Demo 的明确联系路径。表单只在浏览器内准备邮件内容，访客明确打开邮件草稿后由其邮件提供商发送至 `developer@jingtangai.com`；不新增网站数据库、Analytics、CRM、处理方、数据用途或更长保留期。
- Revision 4 — 2026-08-21：Human Owner 将 D3 公共官网生产目标明确为腾讯云首尔轻量应用服务器；增加腾讯云、GoDaddy DNS 与 Let's Encrypt ACME 的公开静态资源、TLS 和有限安全/访问日志处理边界。官网仍不处理账号数据、用户内容、OAuth Token 或应用 Secret；Human Owner 已明确批准更新后的中英双语 Legal/Data Disclosure，并授权 production-candidate commit 与公开 rollout。
