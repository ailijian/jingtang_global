# R4 TikTok Scope Approval

Status: Approved by Human Owner
Prepared: 2026-08-27
Approved: 2026-08-27
Delivery authority: [`../BASELINE.md`](../BASELINE.md), Revision 6
Execution authority: [`../PLAN.md`](../PLAN.md)
Current-state authority after approval: [`../../../../config/integrations.yaml`](../../../../config/integrations.yaml)

## Authority and Effect

This package records the Human Owner-approved TikTok R4 technical slice. Approval authorizes the corresponding Baseline/Registry amendment, company TikTok Organization/App configuration, R4 implementation and one controlled unaudited `SELF_ONLY` Human E2E publish. It does not authorize public availability, TikTok audit/App Review submission, reviewer handoff, checkpoint, push or repository synchronization.

The reviewer account, reviewer instructions, Scope-to-UI trace, demo script/video, domain/business verification and external TikTok review remain in the unified R5 submission stage approved by Baseline Revision 5.

## Decision Requested

Approve or reject the following complete package as one R4 boundary:

1. **Product path:** TikTok Login Kit for Web plus Content Posting API **Direct Post video** only.
2. **Scopes:** automatic Login Kit baseline `user.info.basic` plus exactly `video.publish`.
3. **App ownership:** one durable App registered directly under a company TikTok Organization; Review credentials, tokens, redirect URLs, data and runtime configuration remain isolated and are retired before final-production cutover.
4. **Media transfer:** `FILE_UPLOAD` only, streamed from the private JINGTANG source object after explicit final confirmation. `PULL_FROM_URL` is excluded.
5. **Review visibility:** before TikTok audit, only an eligible private controlled account and an explicitly selected `SELF_ONLY` privacy value may be used.
6. **User control:** fresh Creator Info, editable caption, no default privacy, interaction opt-ins off by default, commercial-content disclosure, AI-generated-content disclosure, TikTok music/policy consent and an immutable final confirmation are mandatory.
7. **Controlled external write:** one approved MP4 is posted once to the Human Owner's controlled TikTok account in `SELF_ONLY` mode for Human E2E.

## Proposed User Need

An authorized JINGTANG Publisher connects their own TikTok account, reviews one approved video and its TikTok-specific caption and disclosures, manually chooses an allowed privacy setting and interaction permissions, confirms the exact account and media, and receives truthful asynchronous processing or failure status.

R4 does not read the user's TikTok feed, list prior videos, copy content from another platform, manage comments, delete TikTok-hosted posts, schedule posts or publish photos.

## App Ownership Decision

### Recommended target

- Create or use a company TikTok Organization and register the App directly under that Organization.
- The company-owned App identity and Client Key may remain durable across Review and future production so review/audit evidence is not intentionally discarded.
- Client Secret material, user tokens, redirect URLs, Sandbox users, data, logs and runtime configuration are environment-specific and must not be reused at production cutover.
- At least two appropriate Organization administrators should be maintained for business continuity; shared developer credentials are prohibited.

### Baseline effect

This is a proposed exception to the current general rule that Review uses an independent OAuth App/Client. If approved, the Baseline must be amended in the same way that Revision 4 expressly handled the durable Meta App ID: the non-secret external App identity may persist, while every runtime secret and authorization boundary remains isolated.

## Scope Matrix

| Scope | State | Need | UI and user action | API use | Stored data |
| --- | --- | --- | --- | --- | --- |
| `user.info.basic` | Automatic Login Kit baseline | Bind the OAuth result to the exact TikTok user by the returned `open_id`; do not request email or expanded profile data | Channels → Connect TikTok → identity and permission explanation | OAuth authorization/token response only; no video-list or follower API | `open_id` subject binding and the minimum connected-account display snapshot |
| `video.publish` | Requested | Query the latest Creator Info, directly post the one confirmed video and track only the returned `publish_id` | Channels identity; TikTok platform version; privacy/interactions/disclosures; final confirmation; Content Detail status | Creator Info query, Direct Post video init, returned upload URL, status fetch | consent snapshot, selected fields, `publish_id`, processing/failure result and public post ID/link only if TikTok returns one |

User approval of a Scope in TikTok does not replace JINGTANG's separate RBAC and immutable publish confirmation.

## Explicitly Excluded Products, Scopes and APIs

- `video.upload`: no Inbox/Draft flow; the product promise is a direct, confirmed publish with deterministic result tracking.
- `video.list`: no existing-post list or feed synchronization.
- Expanded user/profile/metrics scopes: no bio, follower/following counts, likes, email or demographic data.
- Display API video listing, Research API, Data Portability API, Commercial Content API reads, Ads, Messaging, Comments and Webhooks.
- Share Kit/mobile SDKs: R4 is a server-side Web SaaS integration.
- Photo posting, LIVE, Stories, Duet/Stitch creation, post editing/deletion, scheduling and bulk publishing.
- `PULL_FROM_URL`: no public or TikTok-pullable COS URL is created for R4.
- Arbitrary cross-platform copying or watermarked media.

Any added Product, Scope, endpoint or write requires a new Registry revision and Human Owner approval.

## OAuth and API Allowlist

Only the following TikTok hosts and operations are allowed:

1. `GET https://www.tiktok.com/v2/auth/authorize/`
   - exact registered HTTPS redirect URI;
   - non-guessable one-use `state` bound to Workspace, actor and intended operation;
   - `response_type=code`;
   - scopes limited to `user.info.basic,video.publish`.
2. `POST https://open.tiktokapis.com/v2/oauth/token/`
   - authorization-code exchange and refresh on the server only.
3. `POST https://open.tiktokapis.com/v2/oauth/revoke/`
   - programmatic revoke before local authorization cleanup on in-product disconnect.
4. `POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/`
   - invoked fresh when rendering final TikTok publish controls and revalidated before dispatch.
5. `POST https://open.tiktokapis.com/v2/post/publish/video/init/`
   - Direct Post with `FILE_UPLOAD` only after final confirmation.
6. `PUT` to the exact, short-lived `upload_url` returned by TikTok.
   - preserve the full returned URL and query parameters;
   - sequential chunks and exact `Content-Length`, `Content-Range` and media type.
7. `POST https://open.tiktokapis.com/v2/post/publish/status/fetch/`
   - query only the `publish_id` returned for the user's confirmed write.

Content Posting webhooks are excluded from R4. Polling owns status truth; a later webhook addition would require signature/replay controls and a separately approved configuration boundary.

## Exact User Journey

1. An authorized Workspace member opens Channels and sees TikTok as controlled-access/Coming Soon rather than public `Available`.
2. The user accepts the JINGTANG data-purpose and legal notice and selects **Connect TikTok**.
3. JINGTANG performs OAuth with the exact two-scope boundary and stores the resulting tokens only in the server envelope.
4. JINGTANG binds the returned `open_id`, queries Creator Info and shows the account nickname/avatar without reading the user's feed.
5. The Publisher chooses one approved Content item and creates a TikTok platform version with an editable caption.
6. On the final review screen JINGTANG queries Creator Info again and displays:
   - exact TikTok creator nickname/avatar;
   - video preview, byte size and duration;
   - editable caption, maximum 2,200 under TikTok's UTF-16 length rule;
   - privacy options derived from the latest `privacy_level_options`, with no default;
   - Comment, Duet and Stitch opt-ins, all off by default and disabled when Creator Info disallows them;
   - commercial-content disclosure, off by default, with explicit **Your brand** and **Branded content** choices and privacy compatibility;
   - AI-generated-content disclosure, off by default;
   - the applicable TikTok Music Usage Confirmation and Branded Content Policy consent.
7. While the App is unaudited, the journey fails closed unless the controlled creator account is private and the user manually selects an available `SELF_ONLY` option.
8. The Publisher explicitly confirms the exact account, media hash, caption, privacy, interactions and disclosures. JINGTANG creates an immutable intent before any media is sent to TikTok.
9. The worker revalidates token/scope and Creator Info, initializes one Direct Post, streams the private COS object to the returned upload URL and persists the `publish_id`.
10. JINGTANG polls status and presents `processing`, `published` (`PUBLISH_COMPLETE`) or a mapped failure. It explains that processing may take minutes.
11. A private unaudited post may have no public `post_id` or URL. JINGTANG must still preserve truthful completion status and must not invent an external link.
12. Retry after a definitive failed initialization/upload uses the existing explicit-recovery/idempotency controls and never creates a second post silently.

## TikTok Platform Field Contract

| JINGTANG field | TikTok field | Rule |
| --- | --- | --- |
| TikTok caption | `post_info.title` | User-editable; no hidden hashtags or promotional text; at most 2,200 UTF-16 units per TikTok contract |
| Privacy | `privacy_level` | Required manual selection; must be among fresh Creator Info options; no default |
| Allow Comment | inverse of `disable_comment` | Off by default; disabled if Creator Info says comments unavailable |
| Allow Duet | inverse of `disable_duet` | Off by default; disabled if Creator Info says Duet unavailable |
| Allow Stitch | inverse of `disable_stitch` | Off by default; disabled if Creator Info says Stitch unavailable |
| Branded content | `brand_content_toggle` | User-selected; requires compatible non-private visibility |
| Your brand | `brand_organic_toggle` | User-selected |
| AI-generated content | `is_aigc` | User-selected; false by default |

R4 does not expose cover-frame selection; TikTok's default cover behavior applies.

## Media Boundary

- JINGTANG accepts only the existing approved MP4 source object, maximum 500 MiB, which is stricter than TikTok's platform maximum.
- Before confirmation, the browser/application validates available size, MIME and duration evidence. Immediately before dispatch, the worker verifies the immutable object key, size and hash.
- The selected duration must not exceed fresh `max_video_post_duration_sec` from Creator Info.
- MP4/H.264 is the recommended Human E2E fixture. JINGTANG does not transcode; format/frame-size/frame-rate rejection from TikTok is surfaced as a real failure.
- The worker streams the private COS object into TikTok's sequential chunk contract. Chunks follow TikTok's 5–64 MB rule, final-chunk allowance and one-hour upload-URL lifetime.
- The application server does not persist video bytes and does not expose the private COS object publicly.

## Data Flow, Retention and Deletion

### Data received or generated

- OAuth `open_id`, granted scopes, access token, refresh token and expiries.
- Minimum connected-account/Creator Info display snapshot.
- Immutable publish snapshot: Workspace, actor, Content/media hash, creator identity snapshot, caption, privacy, interactions, disclosures and consent time.
- TikTok `publish_id`, processing status, failure reason and returned public post ID/link only when supplied.

### Storage and retention

- Access/refresh tokens remain server-only and use the per-connection Review envelope and detached key reference.
- Fresh Creator Info drives the current UI; only the minimum confirmation/audit snapshot is retained with the execution.
- Source-media retention remains governed by the existing private COS and Content lifecycle; TikTok does not receive media until final consent.
- Logs contain internal correlation IDs and sanitized TikTok error codes, never tokens, client secrets, upload URLs or raw response bodies containing credentials.

### Disconnect and provider-side revocation

1. Deny new TikTok calls for the Channel.
2. Attempt TikTok's OAuth revoke endpoint with the active access token.
3. Retire the exact token key reference and delete local authorization/connected-account data.
4. Preserve only minimized system audit and immutable business-history status.
5. Pseudonymize provider IDs/links from historical executions under the same lifecycle rule used by the Facebook slice.

If the user revokes JINGTANG in TikTok first, invalid-token/`auth_removed` responses fail closed, stop retrying the write and trigger the same local cleanup/reconnection requirement. R4 does not invent a provider deauthorization callback that TikTok does not document for this slice.

Disconnect or JINGTANG data deletion does not delete a video already hosted by TikTok. Post deletion is outside R4 and remains under the TikTok account owner's controls.

## Security and Failure Controls

- Client Secret and user tokens are server-only; no browser, Git, image, screenshot, ordinary log or reviewer video exposure.
- OAuth state is signed, one-use, short-lived and actor/Workspace bound; redirect URI is exact HTTPS.
- The granted-scope set is checked exactly; missing `video.publish` prevents connection readiness.
- Creator Info is queried again before dispatch to prevent stale account/privacy/duration decisions.
- Upload URL host/scheme and full returned signature are validated and preserved; redirects to unapproved hosts are rejected.
- Upload streaming verifies exact object size/hash and uses bounded timeouts/retries without duplicate initialization.
- `access_token_invalid`, `scope_not_authorized` and `auth_removed` require reconnection and are not retried as transient failures.
- TikTok 5xx/internal and rate-limit failures use bounded recovery; spam/risk/account/privacy validation failures are terminal and shown truthfully.
- Status polling honors the documented token rate limit and stops at terminal `PUBLISH_COMPLETE` or `FAILED`.

## App Configuration Freeze

If approved, the R4 TikTok App/Sandbox configuration is limited to:

- owner: company TikTok Organization;
- platform: Web;
- products: Login Kit and Content Posting API Direct Post;
- scopes: automatic `user.info.basic` and requested `video.publish` only;
- one exact Review HTTPS redirect URI;
- actual JINGTANG website, Terms and Privacy URLs;
- Sandbox first for first-time review evidence;
- no Display video list, Share Kit, `video.upload`, photo, webhook or unrelated product;
- public availability remains false.

## R4 Acceptance Evidence

R4 technical acceptance will require all of the following after separate implementation authorization:

- Registry and contracts encode only the approved scope and API allowlist.
- Unit/integration tests cover OAuth state, exact scopes, token refresh/revoke, Creator Info constraints, disclosure/privacy interactions, sequential streaming, status mapping, idempotency and deny-first cleanup.
- Full canonical repository verification passes on the final reviewed commit.
- Code Review has no blocking finding.
- Controlled deployment is healthy and public Registry truth remains `Coming Soon` / `production_available: false`.
- Human E2E proves connect → exact creator → manual `SELF_ONLY` → one private Direct Post → status tracking → disconnect/revoke/delete, without a duplicate write.
- R5 reviewer materials and external TikTok review remain pending and are not counted as an R4 technical pass.

## Material Risks and Responses

- **Unaudited visibility/account restriction:** only a controlled private account and `SELF_ONLY` write are permitted until TikTok audit; public publishing remains unavailable.
- **TikTok intended-use scrutiny:** the product and reviewer narrative must show a general creator SaaS, not an internal account-uploader or arbitrary cross-platform copier.
- **Mandatory UX differs from Facebook:** privacy has no default; interactions are opt-in; commercial and AI disclosures must be represented in the immutable snapshot.
- **Private posts may have no public post ID:** completion is based on `PUBLISH_COMPLETE`; the UI must not fabricate a link.
- **Durable App identity changes the Baseline:** company Organization ownership must be explicitly approved before App creation.
- **TikTok processing is asynchronous:** result polling and honest intermediate status are part of the minimum slice.

## Approval Statement

To approve this package, the Human Owner may reply:

> 批准 R4 TikTok Scope：Login Kit Web + Direct Post Video；仅 `user.info.basic` 和 `video.publish`；公司 TikTok Organization 持有 durable App；仅 FILE_UPLOAD；未审核阶段仅私密账号和手动 SELF_ONLY；批准实现及一次受控私密 Human E2E 发布。外部审核、公开 Available、checkpoint 和同步仍单独审批。

Any narrower approval must explicitly identify which numbered decision is changed. Silence or general permission to continue does not approve external TikTok state changes.

## Official Sources Verified 2026-08-27

- [TikTok Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web)
- [TikTok User Access Token Management](https://developers.tiktok.com/doc/oauth-user-access-token-management)
- [TikTok Scopes Overview](https://developers.tiktok.com/doc/scopes-overview)
- [TikTok Content Posting API — Direct Post](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Direct Post API Reference](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [Query Creator Info](https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info)
- [Get Post Status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)
- [Media Transfer Guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- [TikTok Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [TikTok App Review Guidelines](https://developers.tiktok.com/doc/app-review-guidelines)
- [Working with TikTok Organizations](https://developers.tiktok.com/doc/working-with-organizations)
