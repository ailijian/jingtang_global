# R3 Facebook Scope Approval

- Status: Approved
- Prepared: 2026-08-26
- Policy verification date: 2026-08-26
- Approval date: 2026-08-26
- Approval source: Human Owner explicitly approved the complete package, including the three minimum permissions, data/deletion boundary, durable Meta App ID exception, and one controlled real Page-video Human E2E write.
- Delivery: JINGTANG Social Platform Developer Review Enablement
- Governing target: [`../BASELINE.md`](../BASELINE.md) Revision 4
- Execution owner: [`../PLAN.md`](../PLAN.md), R3

## Authority and Effect

This document is the approved decision input and provenance for the R3 Scope Approval Gate. The amended Baseline and Integration Registry own the resulting target and current permission intent; this package does not replace them.

Approval of this package freezes the R3 Facebook use case, requested permissions, API/data boundary, reviewer evidence, and the recommended durable Meta App identity exception described below. After approval, the repository workflow may:

1. record the narrow Baseline amendment for the durable company-owned Meta App identity;
2. update `config/integrations.yaml` with the approved R3 intent while keeping public status `coming_soon` and `production_available: false`;
3. create and configure the company-owned Meta App and use only the approved permissions and endpoints;
4. implement and verify the R3 slice, including one controlled real Page-video publish during Human E2E after automated and security checks pass.

The controlled Human E2E write is limited to the Human Owner-designated company Page and an approved, non-sensitive, company-owned demonstration MP4. It is not promotion or authorization for arbitrary publishing. The video may be removed manually in Facebook after evidence capture without implying that JINGTANG has a post-deletion capability.

Approval does **not** authorize App Review submission, a public availability claim, public self-registration, promotion, Instagram access, an additional permission, final-production infrastructure acceptance, R3 Stage Acceptance, checkpoint, commit/push, or teardown. Those remain governed by the Plan and their applicable Gates.

## Decision Requested

Approve one real Facebook Page publishing use case:

> An authorized JINGTANG Workspace Publisher connects Facebook through Meta's official OAuth flow, selects one Facebook Page that the person is allowed to manage and create content for, and later gives a separate final confirmation for one approved MP4 video, exact Page, title, and description. JINGTANG streams that user-owned source from private COS to Meta, creates one native Page video, tracks the returned execution truth, and provides disconnect, provider revocation, authorized-data deletion, audit, and bilingual recovery paths.

The approved permission request is exactly:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

`public_profile` is automatically granted by Meta for login. JINGTANG does not request `email` or any other optional profile permission.

## App Ownership and Future Migration Decision

### Recommended decision

Create one durable Meta App owned by the JINGTANG company Business Portfolio. Treat the App ID and its approved permission status as a durable external integration identity rather than as a runtime secret belonging to the temporary Seoul host.

The current Baseline otherwise prohibits a Review OAuth Client from being reused by future production. Approval of this package therefore includes a narrow amendment for **Meta only**:

- the company-owned Meta App ID may survive the Review-to-production migration so an entirely new App does not automatically discard the value of R3 review evidence;
- Review user/Page tokens, authorization records, App Secret material, redirect URI, callback endpoints, databases, logs, and runtime configuration remain environment-bound and may not be reused by future production;
- before final-production cutover, revoke Review authorizations, destroy Review token keys, rotate the Meta App Secret, remove the Review redirect/callback URLs, configure the final-production URLs, and rerun the applicable policy, security, regression, and external-review readiness checks;
- continuing Advanced Access or prior App Review approval after configuration changes is external Meta state and is never assumed. Meta may require another review.

This exception does not make the Seoul deployment production infrastructure and does not relax any data, credential, teardown, or rollout control.

If the Human Owner rejects this exception but approves the remaining Scope, R3 must instead use a dedicated Review App. A later production App must then be treated as a new external identity whose permission approval is not presumed to transfer.

## Functional Boundary

### Included

- Facebook Login/OAuth initiated only by an authenticated JINGTANG user.
- One connected Facebook Page per Channel connection.
- Page discovery and verification of the person's Page tasks.
- Native Facebook Page video publishing through the official Graph/Video APIs.
- `Publish Now` only.
- MP4 (`video/mp4`) source only, maximum 500 MiB, with no server-side transcoding.
- Existing JINGTANG title limit of 1–100 characters and description limit of 0–5,000 characters.
- Exact Page/video/fields confirmation after Content approval and before any Meta write.
- Real provider ID and processing/publication result tracking without inventing success.
- In-product disconnect, Meta permission revocation, deauthorization callback, user-data-deletion callback, local deletion, minimized audit, and bilingual recovery.
- Controlled access for pre-created internal/demo/reviewer SaaS accounts while the public Registry remains `Coming Soon`.

### Excluded

- Facebook Profiles, Groups, Events, Stories, Reels, Live Video, photo-only posts, link posts, text-only posts, cross-posting, branded content, monetization, Ads, Insights, comments, reactions, moderation, Messenger, Social Listening, and Page Webhooks.
- Instagram or Threads.
- Scheduling, recurring/bulk publishing, content download from Meta, cross-platform scraping or republishing.
- Editing or deleting arbitrary existing Page posts.
- Automatically deleting the published Facebook video when a JINGTANG Channel, account, Content item, or Workspace is deleted. The user controls the already-published copy in Facebook.
- A Page privacy/audience selector. JINGTANG must disclose that Page visibility and distribution are controlled by Facebook and the Page's own settings.
- General public onboarding or an `Available` status.

## Actor and Object Preconditions

The connection and publish path must reject unless all applicable conditions hold:

1. the JINGTANG user has an active session and accepted current Legal terms;
2. the user is an authorized member of the selected Workspace;
3. only an Owner or Publisher can connect/disconnect a Channel or give final publish confirmation;
4. the Facebook person completes Meta authentication and grants every approved permission;
5. the selected Page is returned by Meta for that person and includes the task/capability required to create Page content;
6. the Channel, Page ID, and authorization belong to the same Workspace;
7. the Source Asset is complete, user-owned or authorized, MP4, no larger than 500 MiB, and has a validated object hash/size;
8. the exact revision and Facebook platform version are approved;
9. the final confirmation snapshot matches the current approved revision, selected Page, source hash, title, description, mode, and confirming actor;
10. no newer disconnect, deletion, authorization generation, or stale-worker fence invalidates the work.

## Permission Matrix

| Permission | Necessity and official dependency | Exact JINGTANG UI and user action | Allowed API purpose | Data accessed | Retention and deletion | App Review evidence |
| --- | --- | --- | --- | --- | --- | --- |
| `public_profile` (automatic) | Meta automatically grants it for login; it is not an Advanced Access request | Channels → Connect Facebook → continue to Meta | Bind the OAuth result to the authenticating Meta person using only the minimum supported identity fields | Meta user ID and display name when returned | Active connection only for the ID/name linkage; remove provider linkage on disconnect/deauthorization/deletion, retaining only pseudonymized audit | Full login flow; explain that no `email` permission is requested |
| `pages_show_list` | Required to show Pages the person manages and verify Page management; no permission dependency | After OAuth, show only eligible Pages; user explicitly selects one | `GET /me/accounts` with a field allowlist | Page ID, Page name, Page tasks/capabilities; Page tokens may pass through server memory | Persist only the selected Page ID/name/task snapshot and encrypted tokens; discard unselected Page data/tokens immediately; cleanup rules below | Show full OAuth grant, returned eligible Page list, and explicit Page selection |
| `pages_read_engagement` | Dependency of `pages_manage_posts`; permits reading Page-published content and Page metadata | Connected Page identity and Content Detail execution result | Read only the selected Page metadata and the exact video object returned by JINGTANG's publish call | Selected Page metadata; returned Meta video ID and supported status/time/permalink fields | Refresh while connection is active; on disconnect/deauthorization/deletion remove Page/API linkage as soon as possible and within 7 days; no fan, PSID, comment, insight, or unrelated-post access | Show connected Page identity and the actual result of the video created during the review journey |
| `pages_manage_posts` | Required to create Page posts; its documented dependencies are `pages_read_engagement` and `pages_show_list` | Content Review → exact Facebook Page/MP4/title/description → separate Publish Now confirmation | Create only the user-confirmed native video on the selected Page | Approved video bytes, title, description, selected Page ID, returned provider ID/error | Meta keeps the published copy under the Page's control; JINGTANG removes its tokens/linkage on disconnect/deletion but does not claim third-party content deletion | Show approved Content, exact final confirmation, one real Page video creation, returned result in JINGTANG, and the same video on Facebook |

## Explicit Permission Denials

| Permission/product | Decision | Reason |
| --- | --- | --- |
| `publish_video` | Do not request | Meta's permission catalog limits this permission to live-video streaming; R3 publishes an ordinary Page video, not Live Video |
| `pages_manage_metadata` | Do not request | No Page Webhook subscription or Page settings management |
| `business_management` | Do not request | No Business Manager asset claiming or management API use; Business Portfolio ownership is console governance, not a runtime permission need |
| `read_insights` | Do not request | No analytics or performance reporting |
| `pages_read_user_content` | Do not request | No comments, visitor posts, mentions, ratings, or other user-generated Page content |
| `pages_manage_engagement` | Do not request | No comment/reaction moderation |
| `pages_messaging` | Do not request | No Messenger functionality |
| `ads_management`, `ads_read` | Do not request | No Ads capability |
| `user_videos` | Do not request | No access to a person's Profile videos; only the selected Page and the R3-created video are in scope |
| Instagram/Threads permissions | Do not request | R3 is Facebook Page-only; Instagram remains a separately approved scope and R4 owns TikTok |
| `email` | Do not request | JINGTANG identity is already established locally; Facebook email is unnecessary |

No later implementation convenience may add a permission. Any additional permission requires a new current-policy check, an updated Need → Permission → UI → User Action → Data → Retention → Deletion trace, and explicit Human Owner approval before configuration or credential use.

## OAuth and API Allowlist

Use the Meta Graph API version verified at App configuration time. The 2026-08-26 official publishing examples resolve to `v26.0`; R3 should pin `v26.0` unless the App Dashboard or official compatibility evidence requires a different supported version, in which case the change must be recorded before credential use.

Allowed calls are limited to:

1. Meta OAuth authorization dialog with a one-use `state` and the three approved permissions.
2. Server-side authorization-code exchange using an exact HTTPS redirect URI.
3. Minimum person identity read supported by `public_profile`, if required to bind the authorization.
4. `GET /me/accounts` with only `id,name,tasks,access_token` or the smallest current equivalent field set.
5. Official Resumable Upload API calls for the approved MP4:
   - create an upload session at `/{APP_ID}/uploads` using the active user token;
   - stream bytes from private COS to `/upload:{UPLOAD_SESSION_ID}` without writing the media to a persistent host path;
   - resume from the provider-reported offset when safe and generation-current.
6. `POST /{PAGE_ID}/videos` using the selected Page token, returned uploaded-file handle, exact title, and exact description.
7. Read the returned video ID with only the fields required to prove the real processing/publication state and stable result link supported by the pinned API version.
8. Provider revocation through the current official User Permissions deletion endpoint, such as `DELETE /me/permissions`, using the active user token.

The implementation may use `appsecret_proof` where supported. The App Secret and access tokens remain server-only. No general Graph proxy, arbitrary object/field query, unreviewed edge, Page feed crawl, or user-supplied Graph path is permitted.

## User Journey and Permission-to-UI Trace

### Connect

1. User opens Channels and sees Facebook as controlled access only for an authorized account; public website/Registry remain `Coming Soon`.
2. UI explains the three permissions, the selected-Page-only purpose, Meta processing, visibility boundary, retention/deletion, and Cancel behavior in English or Simplified Chinese.
3. User chooses Connect Facebook. The BFF creates a one-use, short-lived, session/Workspace/actor-bound OAuth transaction.
4. Browser goes to Meta. Cancel or denial produces no Channel and no provider API work beyond the OAuth attempt.
5. Callback validates state, code single-use, session actor, Workspace, exact redirect, granted-scope set, and current authorization generation.
6. Server retrieves eligible Pages. The UI shows Page name and enough identity to avoid target ambiguity, without exposing tokens.
7. User selects one eligible Page and confirms connection. Only that Page's token bundle and metadata are persisted; all unselected Page results are discarded.

### Prepare and approve

1. User uploads or selects a complete MP4 Source Asset.
2. Editor creates an independent Facebook platform version with title and description.
3. Approver reviews the exact revision and approves or rejects it.
4. Editing after approval invalidates the approval and requires a new review.

### Publish

1. Publisher opens final confirmation.
2. UI displays source preview/hash-bound revision, Page name/ID reference, MP4, title, description, `Publish Now`, and the fact that Facebook/Page settings control visibility.
3. Publisher gives a distinct confirmation. Cancel creates no intent and performs no Meta upload.
4. Immutable intent/outbox work is created only after authorization and approval are rechecked.
5. Worker streams the exact source to Meta, publishes it to the exact Page, stores the returned provider ID, and tracks only that object.
6. UI distinguishes queued, uploading, Meta accepted/processing, published/confirmed, failed, authorization expired, and unknown/reconciliation-required states. A 2xx upload response alone must not be relabeled `Published` unless the provider evidence supports that state.

### Disconnect and delete

1. Disconnect immediately deny-marks the Channel and prevents new work.
2. Queued/non-started work is rejected; in-flight work is fenced by authorization generation.
3. Worker calls the official Meta permission-revocation endpoint, retires the per-connection envelope key, removes tokens and applicable Meta identity/result linkage, and records only a minimized result.
4. Provider failure never re-enables the Channel. Retry remains durable, but JINGTANG-held token and authorized data are erased no later than the existing 7-day deadline.
5. Meta deauthorization and user-data-deletion callbacks enter the same deny-first durable lifecycle.
6. Published Facebook content remains controlled in Facebook. The user is told how to remove it there; JINGTANG does not claim it was deleted.

## Data Flow, Residency, and Processor Boundary

| Step | Data | From → To | Storage/processing decision |
| --- | --- | --- | --- |
| OAuth start/callback | state, code, granted permissions, minimum Meta person identity | Browser/Meta → Seoul BFF | State/code are single-use and minutes-lived; callback query is excluded/redacted from ordinary access logs |
| Page discovery | user token; Page ID/name/tasks and returned Page token | Seoul BFF ↔ Meta | Tokens never enter browser, logs, audit, screenshots, or demo video; only selected Page metadata/token bundle persists |
| Token storage | user/Page access-token bundle, granted scopes, authorization generation | BFF → local PostgreSQL + `local:v2` envelope boundary | Ciphertext in database; one per-connection data key; wrapped key in root-only, non-backed-up detached store |
| Source retrieval/upload | exact MP4 bytes, size/hash, resumable offset | Private Seoul COS → worker → Meta | Streamed without persistent Lighthouse media file; Meta becomes a processor/independent platform recipient after explicit confirmation |
| Publish | Page ID, title, description, uploaded-file handle | Worker → Meta | Only exact approved snapshot; App Secret/tokens server-only |
| Track | returned video ID and minimal supported status/link fields | Meta → worker → PostgreSQL | Only the R3-created object; no Page feed/fan/content crawl |
| Disconnect/delete | target connection, Meta person/Page linkage, revoke/deletion result | BFF/Meta callback → lifecycle worker → Meta/local stores | Deny first, revoke, cryptographic erase, delete linkage, minimized 365-day audit/deletion evidence |

Approval adds Meta as a disclosed external processor/platform recipient. Before R3 credential use, the Security/Data authority and bilingual Privacy/Terms/Data Deletion/Integration presentation must be updated to describe the approved facts without marking Facebook publicly Available.

## Retention and Deletion Matrix

| Data | Active retention | Triggered cleanup | Backup/audit treatment |
| --- | --- | --- | --- |
| OAuth state/code | Minutes, one callback | Consume once or expire immediately | Never backed up or logged |
| User/Page tokens and scope grant | Only while selected Channel is active and needed | Deny immediately; attempt provider revoke immediately; erase token key/live record immediately when possible and always by the existing 7-day local deadline | Key retirement makes backup ciphertext unusable; database backups expire within 35 days |
| Meta person ID/name, selected Page ID/name/tasks | While connection is active and periodically validated | Remove provider linkage as soon as possible and within 7 days of disconnect, deauthorization, Meta deletion request, account deletion, or Workspace deletion | Deletion ledger replays on restore; retain only pseudonymized evidence |
| Returned video ID/status/link | While the associated Content/Workspace remains active and consent is valid | Remove provider linkage/content payload within 7 days of applicable deletion; do not delete the Meta-hosted video implicitly | Publishing evidence may retain a pseudonymized action fact for up to 365 days |
| Source MP4 and platform version | Existing Source Asset/Content lifecycle | Deny immediately and delete live COS/object metadata within 7 days of authorized deletion | Existing COS/database backup and cryptographic-erasure rules |
| Audit/deletion evidence | 365 days | Pseudonymize actor/provider linkage and expire after evidence period | No token, raw video, title/description body, raw provider error, or Page access token |

While active, authorization and selected-Page capability must be revalidated before publish and through a scheduled validity check. An externally revoked or unrefreshable connection is deny-marked immediately; provider-linked data is cleaned no later than 30 days even without an explicit callback. This 30-day ceiling is a JINGTANG minimization control, not a claim about a Meta-mandated period.

## Meta Callback Contracts

R3 must implement and configure exact HTTPS endpoints under `review.jingtangai.com`:

- OAuth callback: `/api/v1/channels/facebook/oauth/callback`
- Deauthorization callback: `/api/v1/channels/facebook/deauthorize`
- User-data-deletion callback: `/api/v1/channels/facebook/data-deletion`
- Minimal deletion-status route using an opaque confirmation code, with no personal data in the URL or response

The deauthorization and deletion callbacks must validate Meta's signed request against the server-only App Secret, reject replay/tampering, rate-limit safely, never require a browser session, and resolve the Meta user linkage tenant-safely. The deletion callback returns the current official confirmation/status response and drives the existing durable lifecycle rather than deleting synchronously in the request.

## Security and Abuse Controls

- Company Business Portfolio owns the App; at least two named company-controlled administrators; no shared Facebook credentials.
- App Secret, access tokens, OAuth codes, signed requests, upload handles, and raw provider errors are Restricted data.
- Exact HTTPS redirect allowlist; no wildcard redirect; one-use high-entropy state bound to session, actor, Workspace, locale, and short expiry.
- Callback code/state query excluded from Caddy and application logs.
- User and Page token bundle encrypted with the existing per-connection `local:v2` envelope; token never reaches client components.
- Provider client has fixed Meta origins, API version, path/field allowlist, timeouts, response-size limits, redaction, and deterministic retry classification.
- App Secret proof is used where supported; provider error messages are mapped to safe bilingual categories.
- Source stream verifies expected size/hash and 500 MiB cap; no media persists on the host filesystem.
- Worker concurrency remains one on the Seoul Review host; stale leases and authorization generations fence duplicate/ex-authorized writes.
- A provider-returned ID is deduplicated and bound to one immutable intent; retry must reconcile before creating another Page video.
- Tenant/RBAC checks occur at request, intent creation, worker claim, result read, disconnect, and deletion.
- Audit contains safe IDs/correlation/category only; never token, Page token, App Secret, video bytes, title/description body, raw Graph response, or raw callback signed request.

## Meta App Configuration Freeze

After approval and before credentials are used, configure and evidence:

| Setting | Approved value/boundary |
| --- | --- |
| Owner | JINGTANG company Business Portfolio |
| Display identity | `JINGTANG`; exact legal entity `Jingtang (Shanghai) Intelligent Technology Co., Ltd.` where requested |
| Domains | `jingtangai.com`; no unrelated domain |
| Product/use case | Current Meta console option that enables Facebook Login and Pages API only |
| App mode | Development during implementation/reviewer preparation; no public Live claim before required review/Gates |
| OAuth redirect | Exact Review OAuth callback above; HTTPS only |
| Privacy Policy | `https://jingtangai.com/en/privacy/` |
| Terms | `https://jingtangai.com/en/terms/` |
| Data Deletion instructions | `https://jingtangai.com/en/data-deletion/` |
| Deauthorization/deletion callbacks | Exact R3 endpoints above after implementation and deployed callback verification |
| Support | `developer@jingtangai.com` |
| Requested Advanced Access | Only `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` |
| Roles | Named personal developer identities; at least two company-controlled admins; no shared login |
| Business Verification | Required before requesting Advanced Access where Meta requires it; company evidence supplied outside Git/chat |
| Data Use Checkup | Assigned to company owners and recorded as an operational obligation |

App ID is non-secret and may be recorded in protected configuration evidence. App Secret, access tokens, business-verification documents, recovery codes, personal IDs, and reviewer passwords must not enter Git, chat, screenshots, ordinary CI artifacts, or demo video.

## Reviewer Package Requirements

R3 is not submission-ready until the protected reviewer handoff contains:

1. English primary instructions and Simplified Chinese parity notes.
2. SaaS login URL and one dedicated external-reviewer SaaS account from the protected credential inventory.
3. Exact start page after login and Workspace selection steps.
4. Explanation that the reviewer uses Meta's own authorization UI and that JINGTANG never requests a Facebook password.
5. Permission-by-permission rationale matching this package and the App Dashboard exactly.
6. Full screencast with no cuts across:
   - SaaS login;
   - Connect Facebook;
   - Meta consent showing the requested permissions;
   - Page discovery/selection and connected identity;
   - MP4 upload, Facebook version preparation, approval, exact final confirmation;
   - real publish/result in JINGTANG and the matching Page video in Facebook;
   - disconnect/revocation and the resulting disabled state;
   - deletion instructions/status path.
7. Stable, non-expiring demo MP4 owned or authorized by JINGTANG, with no sensitive or third-party copyrighted material.
8. A reviewer-safe Page and Meta test identity/role arrangement that does not disclose a personal password.
9. Privacy, Terms, Data Deletion, support, app domain, OAuth redirect, deauthorization callback, and deletion callback URLs.
10. Expected result, common recovery paths, Page-task prerequisites, and a support contact monitored during review.

Credentials remain outside this document and outside Git. The reviewer package may reference a protected delivery mechanism but must never copy its secrets into repository artifacts.

## Known External Review Risks and Stop Conditions

- The current `pages_manage_posts` permission-catalog screencast text describes creating, editing, and deleting Page posts, while R3 deliberately exposes only creation of one explicitly confirmed video. The App Review narrative must explain that Meta provides no narrower create-only permission and that JINGTANG does not expose arbitrary edit/delete operations. If Meta requires those operations in-product, stop and obtain a new Product/Scope decision instead of silently adding them.
- Meta App Dashboard use-case names, Graph API supported versions, Page task names, Advanced Access prerequisites, callback formats, and review evidence requirements can change. A mismatch at configuration/submission time stops only the affected external step and requires an updated trace before proceeding.
- A Graph upload or publish acceptance does not necessarily prove public availability or completed processing. If the pinned API does not expose a stable field that proves `Published`, the UI must remain `Meta accepted/processing` and the review evidence must use only independently observed provider truth.
- Business Verification, Advanced Access, Data Use Checkup, App Review outcome, rate limits, and continued permission access after later configuration changes are Meta-controlled external state and are not acceptance claims.
- Human E2E creates a real object on the selected Facebook Page. It may proceed only with the designated Page and approved demo MP4; any personal Page, unrelated company Page, sensitive content, or third-party copyrighted asset is a hard stop.

## R3 Verification and Exit Gates

### Repository verification

- Contract schemas/generated types support Facebook without weakening the existing YouTube contract.
- Database migration preserves existing rows and tenant/RLS boundaries.
- Exact three-scope constant and negative tests reject any additional permission.
- OAuth state/callback, partial denial, wrong Workspace, wrong role, ineligible Page task, stale generation, replay, and callback signature tests.
- Graph client endpoint/field allowlist, timeout, retry, reconciliation, redaction, and no-duplicate-write tests.
- Streaming upload size/hash/no-host-persistence checks.
- RBAC, tenant isolation, immutable confirmation, outbox/worker fencing, disconnect/revoke/deletion and restore-ledger regression.
- English/Simplified Chinese semantic parity and public `Coming Soon` truth checks.
- Secret scan, dependency policy, lint, typecheck, build, migration, integration, platform E2E, website E2E, and review release checks.

### Real Human E2E

- Company-controlled Meta identity grants exactly the approved permissions.
- An eligible Page is identified accurately.
- One approved MP4 is published once to the exact Page.
- JINGTANG result matches the returned Meta object and actual Page state.
- Disconnect blocks new work, calls provider revocation, erases the token envelope, and removes authorized linkage.
- Meta deauthorization and user-data-deletion callbacks are verified with signed, non-production test evidence where Meta tooling permits.
- Existing YouTube controlled path, website login, public Registry truth, backup/restore, resource limits, and cleanup do not regress.

### Required Gates

- Scope Approval: this package must be explicitly approved before Registry/Meta credential changes or R3 implementation.
- Code Review: required after implementation.
- Acceptance Review: required after final code/config/evidence state.
- Human E2E: required on the deployed Review environment.
- External Meta App Review submission: separate explicit action; its decision is external state and not R3 Acceptance.

## Approval Checklist

The Human Owner approval covers all checked decisions together:

- [x] One selected Facebook Page native MP4 Publish Now use case.
- [x] Exactly `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`; `public_profile` automatic; no other scope.
- [x] No Facebook Reels/Live/Profile/Group/Ads/Insights/Messaging/Instagram/Threads/Schedule capability.
- [x] Exact final confirmation and real result tracking.
- [x] Meta becomes an approved external processor/platform recipient for this user-directed flow.
- [x] Deny-first revoke/deauthorize/delete lifecycle and no claim to delete the already-published Facebook copy.
- [x] Company Business Portfolio ownership and at least two company-controlled administrators.
- [x] Recommended durable Meta App ID exception with Review credentials/data/URLs isolated and retired before production migration.
- [x] One controlled real Human E2E video write to the designated company Page using an approved company-owned demo MP4.
- [x] Registry remains `Coming Soon` / `production_available: false` until external and production Gates actually pass.
- [x] App Review submission, public rollout, checkpoint and repository synchronization remain separately gated.

Suggested approval statement:

> 批准 R3 Facebook Scope Approval 包，包括三项最小权限、数据/删除边界、durable Meta App ID 例外，以及在指定公司 Page 使用获授权演示 MP4 完成一次真实 Human E2E 发布；授权按包更新 Baseline/Registry、创建并配置公司 Business Portfolio 下的 Meta App，并开始 R3 实现。外部 App Review 提交、公开 Available、checkpoint 和同步仓库仍按后续 Gate 执行。

## Official Sources Verified 2026-08-26

- [Meta permission reference: `pages_show_list`](https://developers.facebook.com/docs/permissions/reference/pages_show_list)
- [Meta permission reference: `pages_read_engagement`](https://developers.facebook.com/docs/permissions/reference/pages_read_engagement)
- [Meta permission reference: `pages_manage_posts`](https://developers.facebook.com/docs/permissions/reference/pages_manage_posts)
- [Meta permission reference: `publish_video`](https://developers.facebook.com/docs/permissions/reference/publish_video) — excluded because the allowed usage is Live Video.
- [Pages API getting started](https://developers.facebook.com/docs/pages-api/getting-started)
- [Video API: publishing to a Page](https://developers.facebook.com/docs/video-api/guides/publishing)
- [Graph API resumable uploads](https://developers.facebook.com/docs/graph-api/guides/upload)
- [User Permissions edge and deletion](https://developers.facebook.com/docs/graph-api/reference/user/permissions)
- [Facebook Login manual flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow)
- [Data deletion callback](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback)
- [Meta App Review submission guide](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/app-review/submission-guide)
- [Business Verification](https://developers.facebook.com/docs/development/release/business-verification)
- [Data Use Checkup](https://developers.facebook.com/docs/development/maintaining-data-access/data-use-checkup)

Official platform behavior remains external state. Re-verify the permission catalog, API version, App Dashboard use-case options, callback formats, screencast requirements, and Advanced Access prerequisites immediately before Meta credential configuration and again before external submission.
