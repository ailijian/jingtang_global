# R4.5 Instagram Scope Approval

- Status: Approved by Human Owner
- Prepared: 2026-08-28
- Policy verification date: 2026-08-28
- Approved: 2026-08-28
- Approval source: Human Owner explicitly approved the R4.5 Instagram Scope package and later selected the public user-removal/callback-confirmation lifecycle after public evidence found no supported Instagram Login programmatic revoke contract. Only the corresponding Approved Baseline and PLAN amendments are authorized. Meta App configuration, external credentials, implementation, deployment, real publishing, commit and push remain unapproved.
- Delivery authority after approval: [`../BASELINE.md`](../BASELINE.md), Revision 8
- Execution authority after approval: [`../PLAN.md`](../PLAN.md), R4.5
- Current-state authority: [`../../../../config/integrations.yaml`](../../../../config/integrations.yaml) (`instagram` remains `coming_soon`, `production_available: false`, and unimplemented)

## Authority and Non-effect

This document records the Human Owner-approved R4.5 decision input and provenance. Amended Baseline Revision 8 owns the resulting Delivery target and the PLAN owns execution; this package does not replace either authority or the Integration Registry's current-state truth.

The approval and authorized Baseline/PLAN amendments do not:

- change the Integration Registry or public `Coming Soon` truth;
- authorize downstream Registry, Design, Architecture, Security/Data, legal, implementation or test changes;
- authorize Meta App creation/configuration, credentials, test users, redirect/callback URLs, deployment, a real Instagram write, App Review submission, public availability, checkpoint, commit, push, merge, or repository synchronization;
- prove that Meta will grant Advanced Access or approve an App Review submission.

Baseline Revision 8 resolves the provider-revocation policy decision by adopting local immediate erasure plus user-directed removal in Instagram and verified callback confirmation. Exact callback mapping, dedicated-App configuration and COS media-fetch behavior remain evidence work. Further repository or external action requires authorization beyond the Baseline/PLAN amendments granted on 2026-08-28.

## Current Official Policy Findings

The following findings were verified against Meta's public developer documentation and Meta's official Postman workspace on 2026-08-28:

1. **Account type:** Instagram API access is for Instagram Professional accounts—Business or Creator—not consumer/personal accounts.
2. **Minimum login path:** Instagram API with Instagram Login does not require a Facebook Page linked to the Instagram Professional account.
3. **Current minimum permissions for this slice:** `instagram_business_basic` and `instagram_business_content_publish`. The former `business_*` names were deprecated on 2025-01-27 and must not be used.
4. **Excluded permissions:** messaging and comment management use separate permissions and are unnecessary for publishing one Reel.
5. **Access level:** a company-owned/managed professional account added to the App can be used with Standard Access without App Review. Serving Instagram accounts the company does not own/manage requires Advanced Access and App Review.
6. **Login-product constraint:** Meta's current App Review documentation says an App can use Facebook Login or Instagram Login, not both for this Instagram API access model. Because JINGTANG's accepted R3 Meta App uses Facebook Login, this package does not assume that App can also host the proposed direct Instagram Login flow.
7. **OAuth/token lifecycle:** authorization starts on `www.instagram.com`; code exchange uses `api.instagram.com`; long-lived exchange and refresh use `graph.instagram.com`. The authorization code is short-lived and single-use; the documented short-lived token lasts one hour, the long-lived token lasts 60 days, and refresh is available after at least 24 hours and before expiry.
8. **Minimum identity read:** `GET /me?fields=user_id,username` supplies the professional-account subject and username needed to display and bind the selected account without reading its media, metrics, biography, followers, or email.
9. **Publishing flow:** create a media container, poll its status until ready, then call `media_publish`. Meta documents `EXPIRED`, `ERROR`, `FINISHED`, `IN_PROGRESS`, and `PUBLISHED` container states and recommends polling at most once per minute for no more than five minutes.
10. **Media delivery:** the Instagram Login publishing path accepts a `video_url` that Meta's servers can fetch. Meta's documented resumable-upload option is limited to Apps implementing Facebook Login for Business, so it is not assumed available to the proposed two-permission Instagram Login path.
11. **Publishing limit:** Meta documents a limit of 100 API-published posts per Instagram Professional account in a moving 24-hour period. R4.5 would authorize only one controlled Reel.
12. **Provider revocation gap:** the public direct-Instagram-Login material inspected for this package does not establish an exact programmatic permission-revocation endpoint or an exact deauthorization/data-deletion callback contract for this flow. The generic Graph User Permissions deletion endpoint is not treated as proof that an Instagram User access token is supported.

Items 6, 10, and 12 materially affect architecture and security. Item 6 supports, but does not itself externally configure, the dedicated-App recommendation below. Item 10 creates a narrowly bounded pull-by-URL exception. Item 12 caused the original Gate failure and the Human Owner's subsequent Revision 8 lifecycle amendment; it is preserved as evidence rather than reinterpreted as a supported endpoint.

## Approved Decision

The Human Owner approved this R4.5 boundary as one package:

1. **Product path:** Instagram API with Instagram Login for Web, publishing one Reel only.
2. **Eligible identity:** exactly one company-owned/managed Instagram Professional account (Business or Creator) added to the App for Standard Access.
3. **Permissions:** exactly `instagram_business_basic` and `instagram_business_content_publish`.
4. **App ownership:** a separate company Business Portfolio-owned Meta Business App dedicated to Instagram Login; do not silently add Instagram Login to or reuse the accepted R3 Facebook Login App.
5. **Media transfer:** after immutable final confirmation, issue one short-lived, object-bound COS HTTPS read URL for Meta's server-side fetch; never expose that URL to the browser, ordinary logs, audit payloads, screenshots, reviewer media, or durable application records.
6. **Publish boundary:** one approved MP4, one account, one user-edited caption, `media_type=REELS`, and fixed `share_to_feed=false`; no Feed distribution selector and no additional Instagram feature.
7. **Controlled external write:** at most one successful `media_publish` for the approved Human E2E intent; retries may reconcile the same container/result but may not silently create a second Reel.
8. **Lifecycle boundary:** deny first, fence queued/in-flight work, retire the per-connection encryption key, delete local token/authorization/connected-account data, stop refresh, instruct the user to remove the App in Instagram, and confirm Meta-side revocation only after a verified deauthorization callback. Preserve only minimized/pseudonymized business-history and callback-correlation evidence. Disconnect does not delete an already published Instagram Reel.
9. **Implementation entry blockers:** before runtime credentials or provider-dependent implementation, freeze deauthorization/data-deletion callback obligations and tenant-safe subject mapping, dedicated-App/login-product configuration, and Meta media-fetch behavior against the chosen COS URL policy. Evidence-only external activity remains separately authorized.
10. **Public truth:** keep Instagram `coming_soon`, `production_available: false`, and restricted to the controlled account throughout R4.5. Advanced Access, arbitrary customer onboarding, App Review submission, and public availability remain R5-or-later decisions.

## Approved User Need

An authorized JINGTANG Workspace Publisher connects one company-controlled Instagram Professional account, selects one approved Content item, reviews its Instagram-specific Reel and editable caption, confirms the exact account/media/caption/distribution boundary, and receives truthful asynchronous container and publish status.

R4.5 does not read the account's media library, synchronize its feed, retrieve metrics, manage comments or messages, use ads or tagging, publish to consumer accounts, or let the user select an arbitrary Instagram account.

## Login and App-Identity Decision

### Recommended path

- Use **Instagram API with Instagram Login**, not Instagram API with Facebook Login.
- Create a separate Meta Business App owned by the same company Business Portfolio and dedicated to Instagram Login.
- Keep at least two appropriate company administrators; shared developer credentials are prohibited.
- Treat the new non-secret App identity as a proposed durable external integration identity only if the Human Owner explicitly adds that exception to the Baseline.
- Keep Review App Secret material, access tokens, redirect/callback URLs, app roles, account bindings, authorization records, data, logs, and runtime configuration isolated from future production. Revoke/retire/rotate/remove them before production cutover and rerun applicable Gates.

### Why the existing R3 Meta App is not the default

The accepted R3 App identity is configured around Facebook Login. Meta's current Instagram App Review documentation states that the applicable App uses either Facebook Login or Instagram Login, not both. Reuse would therefore require current App Dashboard evidence and a revised permission/architecture analysis; it cannot be inferred from common Business Portfolio ownership.

### Rejected alternative: Instagram API with Facebook Login

That path requires a Facebook Page linked to the Instagram Professional account and ordinarily adds `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_content_publish`. It expands both the object graph and permission set for no R4.5 user need. It also mixes the Instagram slice with the accepted Facebook Page boundary. It is not the minimum-permission recommendation.

### Access level

R4.5 uses Standard Access with one company-owned/managed Professional account added to the App. Advanced Access, customer-owned accounts, reviewer credentials, App Review, and public onboarding are explicitly deferred. If current App Dashboard rules make Standard Access insufficient for this exact controlled account, stop and return for Human Owner decision instead of adding permissions or changing the account model.

## Permission Matrix

| Permission | Need | Exact UI and user action | Allowed API purpose | Stored data | Exclusions |
| --- | --- | --- | --- | --- | --- |
| `instagram_business_basic` | Bind the OAuth result to the exact Professional account and display a non-ambiguous identity | Channels → Connect Instagram → Meta consent → show returned username/account reference → confirm connection | OAuth/token lifecycle and `GET /me?fields=user_id,username` only | Provider subject/user ID, username, granted-scope snapshot, token envelope, expiries, authorization generation | No biography, profile picture, follower/following counts, media list, metrics, email, consumer account, discovery, or arbitrary-field proxy |
| `instagram_business_content_publish` | Check publishing capacity, create the one confirmed Reel container, track that container, and publish it once | Approved Content → Instagram version → exact account/media/caption preview → separate final confirmation | Publishing-limit query; `REELS` media-container create; exact container status; one `media_publish` | Immutable consent/publish snapshot, container ID, returned media ID, minimal status/failure evidence | No image, carousel, Story, Feed-video mode, schedule, bulk publish, edit/delete, insights, comments, messages, ads, tagging, or unrelated media read |

JINGTANG RBAC, Content approval, and immutable final confirmation remain separate from Meta permission consent. A granted Meta permission never authorizes an application write by itself.

## Explicitly Excluded Products, Permissions, Fields, and APIs

- `instagram_business_manage_messages` and every messaging/webhook capability.
- `instagram_business_manage_comments` and every comment/moderation capability.
- Legacy `business_basic`, `business_content_publish`, `business_manage_messages`, and `business_manage_comments` permission names.
- Facebook Login/Page-linked Instagram API, `pages_show_list`, `pages_read_engagement`, `instagram_basic`, and `instagram_content_publish` for this proposed path.
- Consumer/personal Instagram accounts and arbitrary external customer accounts.
- Existing-media/feed reads, media discovery, hashtags, mentions, tagging, shopping tags, branded-content tools, ads, insights, profile metrics, followers, and social listening.
- Images, carousels, Stories, Feed-only video, Live, Notes, Threads, direct messages, comments, post editing/deletion, scheduling, recurring/bulk publishing, and cross-account or cross-platform copying.
- Cover-image selection, location, user tags, collaborators, product tags, music selection, templates, filters, and hidden hashtags/promotional text.
- A general Graph proxy, arbitrary object/field reads, arbitrary provider hosts, or user-supplied API paths.
- Direct resumable upload: not assumed available for this Instagram Login path.
- Public onboarding, Advanced Access, App Review submission, or a public `Available` statement.

Any additional permission, product, endpoint, field, media type, account type, distribution option, or callback requires a new current-policy check and explicit Human Owner approval before configuration or credential use.

## Approved OAuth and API Allowlist

The implementation should pin the current supported Graph API version verified at App-configuration time. Meta's 2026-08-28 publishing examples use `v26.0`; use `v26.0` unless current App Dashboard or official compatibility evidence requires another supported version, in which case record the change before credential use.

Only these operations are proposed:

1. `GET https://www.instagram.com/oauth/authorize`
   - exact registered HTTPS redirect URI;
   - `response_type=code`;
   - exactly `instagram_business_basic,instagram_business_content_publish`;
   - signed, non-guessable, one-use, short-lived `state` bound to session, actor, Workspace, platform, and intended connection operation.
2. `POST https://api.instagram.com/oauth/access_token`
   - server-side authorization-code exchange only;
   - code single-use and rejected after expiry;
   - App Secret never enters browser, log, audit, screenshot, or client bundle.
3. `GET https://graph.instagram.com/access_token`
   - exchange the short-lived token for a long-lived token on the server only.
4. `GET https://graph.instagram.com/refresh_access_token`
   - bounded server-side refresh only when eligible and before expiry; no unbounded retry.
5. `GET https://graph.instagram.com/v26.0/me?fields=user_id,username`
   - minimum connected-account identity only.
6. `GET https://graph.instagram.com/v26.0/{IG_USER_ID}/content_publishing_limit`
   - confirm current publishing capacity immediately before intent dispatch; no unrelated usage/insight read.
7. `POST https://graph.instagram.com/v26.0/{IG_USER_ID}/media`
   - only after immutable final confirmation;
   - exact parameters: `media_type=REELS`, one protected `video_url`, user-confirmed `caption`, and fixed `share_to_feed=false`.
8. `GET https://graph.instagram.com/v26.0/{CONTAINER_ID}?fields=status_code,status`
   - query only the container created for the approved intent;
   - poll no more often than once per minute and for no more than five minutes in the immediate attempt, then enter bounded reconciliation without creating another container silently.
9. `POST https://graph.instagram.com/v26.0/{IG_USER_ID}/media_publish`
   - exactly the approved container ID;
   - no second successful publish for the same immutable intent.

The returned media ID may be stored as provider result evidence. Reading a permalink or additional media fields is not in this allowlist; it needs separate official-field verification and approval if later required.

### Operations deliberately not yet allowlisted

- Deauthorization callback processing.
- User-data-deletion callback processing and provider-required response shape.

Programmatic provider revocation is deliberately absent: Revision 8 forbids inferring or calling Facebook Login's permissions-delete operation. Callback processing is not optional and remains blocked pending exact controlled evidence for the Instagram Login flow. Implementation must not substitute the R3 Facebook callback routes or generic Graph subject assumptions.

## Exact User Journey

### Connect

1. An authenticated Owner or Publisher opens Channels and sees Instagram as controlled access/`Coming Soon`, not publicly `Available`.
2. UI explains the two permissions, Professional-account restriction, one-account purpose, external Meta processing, retention/deletion boundary, and Cancel behavior in English and Simplified Chinese.
3. User accepts the current JINGTANG legal notice and chooses **Connect Instagram**.
4. JINGTANG creates the one-use OAuth transaction and redirects to Instagram.
5. Cancel, denial, invalid state, missing scope, wrong account type, expired code, or mismatched actor/Workspace creates no Channel and performs no publishing call.
6. The server exchanges and protects tokens, reads only `user_id,username`, and shows the exact controlled account for confirmation.
7. The user confirms the connection. The Channel is restricted to that exact provider subject and current authorization generation.

### Prepare and approve

1. User selects one complete, approved JINGTANG MP4 Source Asset.
2. User creates an independent Instagram platform version with an editable caption.
3. Approver reviews the exact version. Editing media or caption invalidates approval.

### Publish

1. Publisher opens a distinct final confirmation screen.
2. UI shows the exact Instagram username/account reference, media preview, object-bound size/hash evidence, duration, caption, `Reels tab only`, immediate publish, and the fact that a published copy remains controlled in Instagram.
3. The user gives an explicit final confirmation. Cancel creates no intent, fetch URL, container, or external write.
4. JINGTANG creates the immutable intent/outbox item only after rechecking RBAC, Workspace ownership, account subject/generation, Content approval, object hash/size, and current token/scopes.
5. The worker checks publishing capacity, creates one narrowly scoped signed COS read URL, and sends it only in the server-to-Meta container request.
6. The worker records the container ID and polls only that container. It does not create another container while the result is unknown.
7. When the container is `FINISHED`, the worker calls `media_publish` once and stores the returned media ID. `EXPIRED`, `ERROR`, authorization failure, unknown timeout, and terminal validation failures are shown truthfully.
8. UI distinguishes queued, Meta fetching, processing, ready-to-publish, publishing, published, failed, authorization expired, and reconciliation required. A container-create success or `FINISHED` upload status is not mislabeled as published.
9. Explicit recovery reuses/reconciles the existing provider identifiers whenever possible. A new container after a definitive non-publish failure requires a fresh user-visible recovery decision and still must never create a second successful Reel for the same approval silently.

### Disconnect and delete

1. Disconnect immediately deny-marks the Channel and increments/fences its authorization generation.
2. Queued work is cancelled; in-flight workers recheck the generation before every provider write.
3. Local token key material is retired immediately; token, authorization/account linkage and applicable authorized data are deleted under the existing lifecycle, and refresh is permanently disabled for that authorization generation.
4. UI shows that JINGTANG is locally disconnected and gives exact bilingual instructions to remove the App under Instagram **Website permissions → Apps and websites → Active → Remove**. It does not show provider revocation as complete.
5. A valid deauthorization callback is signature/replay checked and tenant-safely correlated. Only then does JINGTANG record `provider revocation confirmed`; a callback arriving before an in-product disconnect executes the same deny-first local cleanup.
6. If the user does not remove the App, JINGTANG retains no usable token and performs no refresh. Provider authorization may expire under Meta's lifecycle, but expiry is not represented as confirmed revocation.
7. Historical business records keep only pseudonymized action/status evidence and a one-way callback-correlation value under the existing minimized audit boundary; provider account identity, token, URL, caption body, and linkable provider data are removed when required.
8. An Instagram-hosted Reel remains under the Instagram account owner's control. JINGTANG does not claim disconnect, local deletion, or App removal deletes it.

## Instagram Platform Field Contract

| JINGTANG field | Instagram field | Approved rule |
| --- | --- | --- |
| Media type | `media_type` | Fixed server-side to `REELS`; not user-selectable |
| Source video | `video_url` | One server-created, short-lived, object-bound HTTPS read URL after final confirmation only |
| Caption | `caption` | User-editable; no hidden hashtags or appended promotion; reject before confirmation when over the current official/API limit frozen at implementation time |
| Feed distribution | `share_to_feed` | Fixed server-side to `false`; UI states **Reels tab only** and offers no broader selector |
| Publish timing | API call timing | `Publish Now` only; no schedule |

No other media-create parameter is allowed in R4.5.

## Media and Pull-by-URL Boundary

- Accept only the existing approved MP4 source object, maximum 500 MiB, with no JINGTANG transcoding.
- Human E2E fixture should use H.264 video and AAC audio, 9:16 recommended, 3 seconds to 15 minutes, and stay within Meta's current frame-rate/dimension/bitrate limits.
- Immediately before dispatch, verify the immutable object key, byte size, media type, and stored content hash against the approved snapshot.
- Generate the COS URL server-side only after final confirmation. Bind it to the exact object and read method; use HTTPS, the shortest operational TTL, and a hard maximum of 60 minutes unless a smaller tested bound works.
- The object must remain private outside the signed URL. Do not change bucket/object ACL to public and do not create a reusable public CDN URL.
- Never return the URL to a browser or store it in application tables, job payloads, audit, ordinary logs, error traces, metrics labels, screenshots, or reviewer recordings. Structured logging must redact query strings and provider request bodies.
- Validate that the URL host is the configured Review COS origin and that it cannot be redirected to another object/host. The server must not accept a user-supplied `video_url`.
- Do not revoke the URL before Meta has completed the fetch/container transition. Expiry and reconciliation behavior must be tested without extending exposure silently.
- Before external credentials, verify Meta fetch compatibility with COS HTTPS, redirect behavior, `HEAD`/`GET`/Range expectations, content type/length, and the chosen TTL. Record only sanitized evidence.

This is a deliberate exception to the R4 TikTok `FILE_UPLOAD` boundary. It is named in Baseline Revision 7 and must also be added to the Security/Data authority after separate implementation authorization; implementation convenience cannot introduce it implicitly.

## Data Flow, Retention, and Deletion

| Step | Data | From → To | Proposed treatment |
| --- | --- | --- | --- |
| OAuth start/callback | state, code, exact scopes | Browser/Instagram → Seoul BFF | State/code are minutes-lived, one-use, actor/Workspace-bound, redacted from access logs, and never backed up |
| Token lifecycle | short/long-lived token, expiry, scope grant | BFF ↔ Meta | Server-only; per-connection encrypted envelope and detached key reference; no browser/log/audit/screenshot exposure |
| Identity | `user_id`, `username` | Meta → BFF/PostgreSQL | Minimum active connection identity only; no profile/media/metric expansion |
| Source fetch authorization | one signed COS URL | Worker → Meta | Created after final confirmation, transmitted only to Meta, never persisted, shortest viable TTL and at most 60 minutes |
| Media fetch | approved MP4 bytes | Private Seoul COS → Meta | Meta fetches the exact object; JINGTANG does not create a public object or persist a second media copy |
| Publish | subject ID, caption, container ID | Worker ↔ Meta | Exact immutable snapshot and exact provider IDs only |
| Track | container status/error, returned media ID | Meta → Worker/PostgreSQL | Only the container/media created for the approved intent; sanitize raw errors |
| Disconnect/delete | authorization generation, local cleanup result, callback confirmation | BFF/lifecycle worker ↔ Meta/local stores | Deny/fence/cancel, cryptographic erase, stop refresh, show manual-removal requirement, confirm provider revocation only after verified callback, retain only minimized pseudonymized/correlation evidence |

### Retention rules

- Active tokens and provider identity exist only while the Channel remains active and needed.
- Token/key cleanup is immediate when possible and no later than the existing seven-day local deadline after disconnect, deauthorization, valid data-deletion request, account deletion, or Workspace deletion.
- Long-lived tokens must be refreshed only while the connection is valid and used; an unrefreshable or externally revoked connection fails closed and enters lifecycle cleanup.
- Source-media retention remains governed by the existing Content/COS lifecycle; granting Meta one-time fetch access does not extend JINGTANG retention.
- The signed URL expires automatically and is not a retained business record.
- Immutable publication evidence may retain pseudonymized action fact/status under the existing audit period, without tokens, username, caption body, source URL, raw provider error, or linkable account identity.
- Database backups and deletion-ledger behavior remain governed by the current Security/Data authority; key retirement makes backed-up token ciphertext unusable.

## Security, Failure, and Idempotency Controls

- App Secret and access tokens are server-only and encrypted at rest using the existing per-connection envelope boundary.
- OAuth `state` is mandatory for JINGTANG even where provider examples describe it as optional.
- Redirect URI is exact HTTPS; callback parameters and tokens are excluded from ordinary access logging.
- The granted-scope set must equal/satisfy only the two approved permissions; missing scope blocks readiness and unexpected permission expansion is recorded and rejected for operational use.
- Every API route, host, method, version, object ownership rule, and field set is explicit; no generic Meta/Instagram Graph client is exposed to application input.
- Before each provider write, recheck actor-derived immutable intent, Workspace/Channel binding, current authorization generation, account subject, token validity, exact scopes, Content approval, and media hash/size.
- Container IDs and returned media IDs are tenant-bound opaque provider identifiers. A worker may never operate on a user-supplied ID.
- The signed media URL is secret-equivalent transient authorization; redact query strings and request bodies before logs/errors/telemetry.
- Rate limits and 5xx failures use bounded retry with backoff. Authentication/scope/account-type failures require reconnect. Validation/policy errors are terminal and visible.
- Immediate container polling follows the official once-per-minute, five-minute recommendation. Later reconciliation is bounded and cannot create another container or publish while truth is unknown.
- `media_publish` uses an atomic provider-write claim and durable attempt/result state. A timeout after dispatch is `unknown/reconciliation-required`, never an automatic retry that could duplicate the Reel.
- Disconnect wins over new work. A stale worker fails its generation fence before external write.
- No claim of provider revocation, deauthorization handling, or data-deletion compliance may be made until the callback contracts below are proven and implemented. Local disconnect, token expiry and callback confirmation remain three distinct states.

## Mandatory Pre-credential Evidence Gate

After Baseline Revision 8, R4.5 must still stop before runtime credential use or provider-dependent implementation until all four records below are complete:

1. **Approved user-removal lifecycle contract**
   - immediate local deny/fence/cancel, Token Key retirement, token/authorization/account-data deletion and refresh prohibition;
   - exact bilingual Instagram removal instruction plus distinct local-disconnected, manual-removal-required and provider-revocation-confirmed states;
   - a minimized one-way callback-correlation record without token or direct provider identity.
2. **Deauthorization and data-deletion contract**
   - whether Meta requires or supports callbacks for this login product;
   - exact signature/secret, subject identifier, replay, response/status URL, retention, and dashboard configuration requirements;
   - tenant-safe mapping that cannot assume the accepted Facebook App-scoped user ID or callback route.
3. **Dedicated App/login-product contract**
   - current App type/product, company Business Portfolio ownership, Standard Access eligibility, account-role binding, exact redirect URI, allowed domains, and confirmation that the App uses Instagram Login without altering the R3 Facebook Login App.
4. **Media-fetch contract**
   - one sanitized, non-publishing compatibility probe or official evidence for COS HTTPS, fetch timing, redirects, `HEAD`/`GET`/Range behavior, content length/type, and a tested smallest TTL;
   - no real Reel publish is authorized by this package preparation.

Programmatic Instagram revoke is neither required nor claimed after Revision 8. Do not call Facebook Login's `DELETE /{user-id}/permissions`, reinterpret local token deletion or token expiry as provider revocation, or switch to the broader Facebook Login permission path. Evidence-only App configuration, OAuth/user-removal callback observation and a container-create probe that never calls `media_publish` require separate Human Owner authorization.

## Pre-credential Evidence Review — 2026-08-28

The Human Owner authorized a public-documentation-only review of this Gate. The review did not use a Meta login, App Dashboard, App configuration, external credential, provider API call, deployment, publish, commit, or push.

| Gate item | Current official evidence | Result | Unresolved requirement |
| --- | --- | --- | --- |
| Programmatic revoke | Current Instagram Login overview, Business Login, token and Get Started documentation define authorization, token exchange and refresh, but do not publish an Instagram Login provider-revoke endpoint. Meta documents `DELETE /{user-id}/permissions` under **Facebook Login** only. | **BLOCKED** | Obtain a current official Instagram Login-specific URL, host, method, token/subject contract and success/failure semantics. The Facebook Login endpoint is not accepted as proof. |
| Deauthorization and data deletion | The Instagram use-case setup requires Deauthorization Callback URL and Data Deletion Request URL settings. Meta's generic data-deletion contract defines a signed `POST`, HMAC-SHA256 verification with the App Secret, an App-scoped user identifier, and a `{url, confirmation_code}` response. | **PARTIAL — BLOCKED** | Freeze the Instagram Login-specific deauthorization payload/signature/replay contract and prove how its subject maps tenant-safely to the authorization. Public sources do not establish that mapping. |
| Dedicated App and Standard Access | Meta states that an App can use Facebook Login or Instagram Login, not both, and its Instagram use-case guide directs developers who need both to create an App for each setup. A Business App using Instagram Login with an owned/managed Professional account can use Standard Access without App Review; broader client-account use requires Advanced Access and App Review. | **PASS for the policy/design contract** | Actual Business Portfolio ownership, App type/product, controlled-account role, exact redirect/domain configuration and unchanged R3 App state remain later Dashboard evidence and are not authorized by this review. |
| COS media fetch | Content Publishing states that Meta fetches `video_url` media from a publicly accessible server, defines container status polling, and limits resumable upload to Facebook Login for Business. | **PARTIAL — BLOCKED** | Public documentation does not freeze redirect, `HEAD`/`GET`/Range, exact header, fetch-window or minimum signed-URL TTL behavior. A sanitized credentialed container-create compatibility probe is required later; it must not publish a Reel. |

### Identity-mapping ambiguity

The public token-exchange and `/me` field documentation do not provide a sufficiently unambiguous mapping among the authorization response's `user_id`, the App-scoped `id`, the Instagram Professional `user_id`, and the App-scoped subject delivered by lifecycle callbacks. R4.5 must not assume these identifiers are interchangeable, reuse the R3 Facebook callback identity, or expand the approved identity read beyond `GET /me?fields=user_id,username` without a new decision.

### Original Gate result and stop boundary

**Pre-credential Evidence was BLOCKED / NOT SATISFIED under Baseline Revision 7 on 2026-08-28.** The missing programmatic revoke contract triggered Revision 7's mandatory stop. Callback mapping and media-fetch evidence also remained incomplete. At that point R4.5 could not proceed to Registry/Design/Architecture/Security/Data/legal amendments, implementation, Meta App configuration, credential use, deployment, provider writes, or Human E2E.

The available Human Owner decision paths are:

1. Preserve the approved minimum-permission Baseline and obtain written Instagram Login-specific revoke and callback clarification from Meta Developer Support. The Human Owner authorized a local draft on 2026-08-28; external submission still requires separate authorization.
2. After the official lifecycle contract is resolved, separately authorize the dedicated App configuration and one sanitized, non-publishing container-create probe to freeze COS request/TTL behavior. This probe requires credentials and is an external provider write even though it must not call `media_publish`.
3. Explicitly amend the Baseline to replace programmatic provider revocation with deny-first local deletion plus user-directed manual removal and callback confirmation. This is a material lifecycle change and requires truthful pending-versus-confirmed states.
4. Re-scope to Facebook Login for Business and its Page-linked object/permission model. This is not the approved minimum-permission slice and requires a new Scope package and Baseline amendment.

The local [`R4_5_META_DEVELOPER_SUPPORT_INQUIRY_DRAFT.md`](R4_5_META_DEVELOPER_SUPPORT_INQUIRY_DRAFT.md) was separately authorized and prepared on 2026-08-28 but was not submitted. After additional public-policy review, the Human Owner selected option 3 instead.

## Human Owner Lifecycle Amendment — Revision 8

On 2026-08-28 the Human Owner explicitly decided to adopt Instagram's public user-removal model:

> 采用 Instagram 官方公开的用户撤销模型。点击“断开”后：JINGTANG 立即禁止新操作；取消任务并销毁本地 token/key；显示明确指引，让用户前往 Instagram 移除 App；接收 Deauthorization Callback，确认提供方撤销完成；若用户不操作，Instagram token 最迟随生命周期到期，但不能声称已完成 Meta 侧撤销。

This decision authorizes Baseline Revision 8 and the matching PLAN amendment only. It does not authorize downstream owner amendments, implementation, App configuration, credentials, OAuth, callback testing, media probes, deployment, publishing, external communication, commit, or push.

### Current Gate effect

- The programmatic-revoke blocker is **CLOSED BY HUMAN DECISION**, not reclassified as supported or passed.
- JINGTANG must immediately make its own authorization unusable and erase token/key material; this is local disconnection, not Meta-side revocation.
- User removal in Instagram is the only approved provider-revocation action. A verified deauthorization callback is the only approved confirmation signal.
- No token refresh is allowed after local disconnect. Provider token expiry is a fallback lifecycle fact, not proof of revocation.
- The Meta Support draft is superseded for this decision and remains unsubmitted.
- Callback signature/subject/tenant mapping, actual dedicated-App configuration and COS fetch/TTL behavior remain **EXTERNAL EVIDENCE PENDING** and require separate authorization.

## R4.5 Acceptance Evidence

If separately authorized after an approved Baseline amendment and PLAN insertion, technical acceptance should require:

- Registry and generated contracts encode only the approved two permissions and endpoint/field allowlist while public truth remains `Coming Soon` / `production_available: false`.
- Architecture and Security/Data authorities explicitly own the dedicated Instagram App boundary, pull-by-URL exception, token lifecycle, data flow, retention/deletion, approved manual-removal lifecycle and proven callback contract.
- Bilingual legal/consent presentation names Instagram/Meta processing, the exact purpose, media transfer, retention/deletion, third-party hosted-copy boundary, and current versioned consent without claiming public availability.
- Design Authority and UI implement exact account clarity, two-scope explanation, Reels-only distribution, immutable final confirmation, truthful asynchronous status, duplicate-safe recovery, and deny-first disconnect.
- Unit/integration tests cover state/code replay, exact scopes, Professional-account restriction, token exchange/refresh/expiry, field/endpoint allowlists, signed-URL redaction/expiry, container status, publish idempotency, ambiguous timeout, generation fencing, local disconnect, refresh prohibition, manual-removal UX, callback signature/replay/tenant mapping, cryptographic erase, pending-versus-confirmed truth, retention and pseudonymization.
- Canonical repository verification passes on the final candidate and final Code Review has no blocking finding.
- Controlled Review deployment resolves to the exact reviewed candidate and passes health/security/log inspection with Instagram still restricted.
- One separately authorized Human E2E proves connect → exact identity → approved MP4/caption → immutable confirmation → one Reel published in the Reels tab only → truthful tracking → immediate local disconnect/cleanup → visible manual-removal requirement → user removal in Instagram → verified callback confirmation, without a duplicate external post or early provider-revocation claim.
- R5 reviewer materials and external App Review/Advanced Access remain pending and are not counted as an R4.5 technical pass.

## Deferred to R5 or Later

- Advanced Access and arbitrary customer-owned Instagram Professional accounts.
- Meta App Review submission, reviewer accounts/instructions, screencast, Permission-to-UI trace, Business/Domain Verification, and external decision tracking.
- Public self-service onboarding or `Available` status.
- Any account type, permission, endpoint, media type, feature, distribution mode, or data use excluded above.
- Production infrastructure acceptance and Review-to-production cutover.
- A public product promise that depends on external Meta approval.

## Downstream Documents After Approval

The 2026-08-28 approval authorized items 1–2 only. Items 3–8 remain the expected coherent amendment pass after separate implementation authorization. Update existing owners rather than creating parallel facts:

1. [`../BASELINE.md`](../BASELINE.md): add R4.5 Goal/outcome, exact decisions, non-goals, preserved constraints, acceptance criteria, dedicated Instagram App exception, pull-by-URL exception, controlled Human E2E boundary, and R5 deferral.
2. [`../PLAN.md`](../PLAN.md): insert **R4.5 — Instagram Review Slice** between completed R4 and R5, with Scope Approval, implementation, Code Review, Acceptance Review, Human E2E, and Stage Acceptance Gates. Do not renumber or reopen accepted R3/R4 history.
3. [`../../../../config/integrations.yaml`](../../../../config/integrations.yaml): record approved intent and later observed implementation evidence while keeping public status unavailable until a separate rollout decision.
4. The existing [V1 Design Authority](../../jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md): add Instagram connect, account identity, Reel confirmation, processing/failure, disconnect, bilingual/mobile, and accessibility states.
5. The existing [Architecture authority](../../../architecture/README.md): add the adapter/API allowlist, dedicated App identity, token lifecycle, worker/container state machine, signed COS URL boundary, idempotency, and failure model.
6. The existing [Security/Data authority](../../../security-and-data/README.md): add OAuth/data flows, Meta processor boundary, URL secrecy, retention/deletion, the Revision 8 manual-removal/callback-confirmation lifecycle, key lifecycle, logging/telemetry redaction, and migration isolation.
7. Existing bilingual Privacy, Terms, Data Deletion, integration disclosure, and versioned-consent owners: add Instagram facts before any credential use or consent collection.
8. Existing test owners and [Operations](../../../OPERATIONS.md): add policy/contract/release gates, Review configuration checks, incident/recovery behavior, and R5 evidence routing.

Do not create a separate permanent Instagram product/architecture/security truth document when an existing durable owner applies.

## Approval Record and Further Authorization

### Recorded approval

On 2026-08-28 the Human Owner replied:

> 批准 R4.5 Instagram Scope 决策包，并授权按该决策修订 Approved Baseline 与 PLAN。仍不授权配置 Meta App、使用外部凭证、部署、真实发布、commit 或 push。

That approval authorized the Baseline Revision 7 and R4.5 PLAN amendments only. It did not authorize external configuration, credentials, implementation, deployment, real publishing, checkpoint, commit, or push.

After the public evidence review, the Human Owner explicitly selected the Instagram public user-removal model quoted in “Human Owner Lifecycle Amendment — Revision 8”. That decision authorized Baseline Revision 8 and the corresponding PLAN amendment only. It did not authorize submitting the Meta Support draft or any downstream documentation, configuration, credential, implementation, probe, deployment, publish, checkpoint, commit, or push action.

### Further authorization

The original read-only Pre-credential Evidence review completed on 2026-08-28 with a **BLOCKED / NOT SATISFIED** result under Revision 7. Revision 8 now closes the programmatic-revoke decision through an explicit target amendment; the local Meta Support draft is superseded and remains unsubmitted. Callback identity mapping, actual dedicated-App/Standard Access configuration and COS fetch/TTL behavior remain **EXTERNAL EVIDENCE PENDING**. Registry/Design/Architecture/Security/Data/legal amendments, implementation, Meta App configuration, credentials, OAuth/callback observation, media probes, deployment, provider writes and one real Human E2E write remain separately scoped authorizations.

Any material change to login product, App reuse, permissions, account ownership, media transfer, distribution, lifecycle, or external-write count requires a new current-policy check and explicit Baseline amendment. Silence or general permission to continue does not grant an external action.

## Official Sources Verified 2026-08-28

- [Instagram API with Instagram Login — Overview](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login)
- [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram API with Instagram Login — Get Started](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started)
- [Instagram Platform — Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- [Instagram Platform — App Review](https://developers.facebook.com/docs/instagram-platform/app-review)
- [Create an App — Instagram APIs](https://developers.facebook.com/docs/development/create-an-app/other-app-types/instagram-apis)
- [Create an App — Instagram use case](https://developers.facebook.com/docs/development/create-an-app/instagram-use-case)
- [User Data Deletion](https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback)
- [Facebook Login — Permissions request and revoke](https://developers.facebook.com/docs/facebook-login/guides/permissions/request-revoke) — consulted only as a product-specific contrast; it is not treated as proof for Instagram Login.
- [Instagram User API Reference](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/user-profile)
- [IG User Content Publishing Limit](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing-limit)
- [Meta official Instagram API Postman workspace](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api)
- [Graph API User Permissions reference](https://developers.facebook.com/docs/graph-api/reference/user/permissions) — consulted only to identify the revocation ambiguity; it is not treated as proof for Instagram Login.

## Provenance and Verification Limits

- Only public Meta documentation was used. No Meta account, App Dashboard, access token, App Secret, test account, external credential, provider API call, deployment, or publish was used.
- Meta developer pages returned intermittent automated-fetch rate limits during this work; conclusions were cross-checked against the public pages available in the browser and Meta's official Postman workspace. App Dashboard-specific configuration remains deliberately unverified.
- The dedicated-App recommendation is a JINGTANG architecture decision derived from Meta's current login-product constraint and the existing R3 Facebook App boundary; it is not a claim that Meta requires separate Business Portfolio ownership.
- The 60-minute signed-URL ceiling, 500 MiB source limit, fixed `share_to_feed=false`, and one-publish boundary are JINGTANG controls chosen to minimize exposure and scope; they are stricter than Meta's broad platform capability.
- No Instagram Login programmatic revoke contract was established and none is required or claimed after Revision 8. Exact callback identity mapping and COS fetch behavior remain unresolved evidence rather than being represented as complete.
