# R4.5 Meta Developer Support Inquiry Draft

- Status: **SUPERSEDED LOCAL DRAFT — NOT SUBMITTED**
- Prepared: 2026-08-28
- Delivery: JINGTANG Social Platform Developer Review Enablement, R4.5 Instagram Review Slice
- Product: Instagram API with Instagram Login
- Authority: Human Owner authorized drafting only. No submission, Meta login, App configuration, external credential, provider API call, deployment, publish, commit, or push is authorized.
- Related approved scope and evidence: [`R4_5_INSTAGRAM_SCOPE_APPROVAL.md`](R4_5_INSTAGRAM_SCOPE_APPROVAL.md)

> Superseded on 2026-08-28: the Human Owner adopted Baseline Revision 8's public user-removal/callback-confirmation lifecycle. This draft remains historical decision input and must not be submitted without a new explicit decision and external-communication authorization.

## Internal Submission Boundary — Do Not Paste

This file is a decision input and proposed external communication, not current Meta policy or an amendment to the Approved Baseline.

Before any submission:

1. Obtain separate Human Owner authorization for external representational communication.
2. Recheck that the text contains no App Secret, access token, authorization code, signed media URL, account identifier, personal data, internal hostname, log, screenshot, or unpublished provider response.
3. If the support form requires an App ID, stop unless configuration of the dedicated Instagram App and disclosure of that identifier have both been separately authorized. Do not use the existing R3 Facebook Login App as a substitute.
4. Preserve Meta's complete response, response date, source URL/ticket identifier, and any product/version qualification as Gate evidence. A generic Facebook Login answer does not satisfy the Instagram Login Gate.
5. Do not treat a support response as authorization to configure, credential, implement, probe, deploy, or publish.

## Proposed Support Request

### Subject

Official contract clarification for Instagram API with Instagram Login: revocation, lifecycle callbacks, and hosted Reel media fetch

### Product / Topic

- Product: Instagram Platform
- Login product: Instagram API with Instagram Login / Business Login for Instagram
- Intended access: Standard Access for one company-owned or managed Instagram Professional account
- Intended permissions: `instagram_business_basic` and `instagram_business_content_publish` only

### Message

Hello Meta Developer Support,

We are evaluating a minimum-permission server-side integration using **Instagram API with Instagram Login**, not Facebook Login for Business. The proposed integration would use a dedicated Meta Business App, Standard Access, one company-owned or managed Instagram Professional account, and only these permissions:

- `instagram_business_basic`
- `instagram_business_content_publish`

Before creating or configuring the App or using credentials, we need the current official contract for authorization revocation, lifecycle callbacks, and Meta's fetch of hosted Reel media. We have reviewed the current Instagram Login overview, Business Login, Get Started, App Review, App setup, data deletion, and Content Publishing documentation. The points below are not sufficiently specified there for us to implement safely.

Please answer each numbered question specifically for **Instagram API with Instagram Login**. Where possible, please provide the current official documentation URL. If a requested operation is not supported for this login product, please confirm that explicitly rather than referring us to a Facebook Login endpoint.

#### 1. Programmatic revocation

1.1 What is the officially supported server-side operation for an App to revoke or remove a person's authorization granted through Instagram API with Instagram Login?

1.2 Please provide its exact HTTP method, host, path, required identifier, accepted token type, and required parameters.

1.3 Does the operation revoke all permissions granted to this App, selected permissions only, or the underlying Instagram authorization more broadly?

1.4 What are the documented success response and relevant error responses, including behavior when the user token is expired, already revoked, or otherwise invalid?

1.5 Is Facebook Login's `DELETE /{user-id}/permissions` operation officially supported for a token and subject issued by Instagram API with Instagram Login? If yes, please specify the correct Graph host, identifier semantics, token type, and Instagram Login documentation that establishes support. If no programmatic revoke exists, please confirm the required user-driven removal process.

#### 2. Deauthorization and data-deletion callbacks

2.1 Is the Deauthorization Callback URL configured in the Instagram use-case App setup invoked when a person removes or revokes an authorization created through Instagram API with Instagram Login?

2.2 What is the exact request method and payload for that callback? Is it a `signed_request`; if so, which App secret/signature algorithm and validation rules apply?

2.3 Which identifier is delivered as the callback subject, and how does it map to each of the following Instagram Login values?

- the `user_id` returned by the authorization-code token exchange;
- the App-scoped `id` documented for `/me`;
- the Instagram Professional account `user_id` documented for `/me`.

2.4 What timestamp, expiry, replay-protection, retry, response-status, and acknowledgement rules apply to the deauthorization callback?

2.5 Does Meta's generic User Data Deletion `signed_request` contract apply unchanged to an App using only Instagram API with Instagram Login? Please confirm the callback subject semantics, required response body, status URL requirements, retries, and retention/deletion deadline.

2.6 Can one Instagram authorization be represented by multiple callback subjects or Professional-account identifiers over its lifecycle? If so, what stable identifier should a multi-tenant server use to map a callback to the exact authorization without relying on username?

#### 3. Hosted Reel media fetch

Our planned content-publishing flow would pass Meta a short-lived HTTPS `video_url` for one private Tencent Cloud Object Storage object. The object would remain private except for the object-bound signed URL. We would create one `REELS` container and would call `media_publish` only after the container is ready and after a separate internal approval.

3.1 When Meta fetches a `video_url` for an Instagram Reel container, can it issue `HEAD`, `GET`, and HTTP Range requests? Which methods and Range behavior must the origin support?

3.2 Are HTTPS redirects followed? If yes, what redirect codes, maximum redirect count, and same-host/cross-host restrictions apply?

3.3 Which response headers are required or relied on, including `Content-Type`, `Content-Length`, `Accept-Ranges`, `Content-Range`, caching headers, and content disposition?

3.4 When can the first fetch begin, for how long can fetch or retry attempts continue, and when is it safe to expire the URL? Is a 60-minute URL lifetime sufficient for the documented container-processing flow under normal and retry conditions?

3.5 Does Meta require a publicly readable object, or is an object-specific signed HTTPS URL with query parameters supported as long as Meta can fetch it for the required interval?

3.6 Is creating a Reel media container without calling `media_publish` an approved non-publishing compatibility test for Standard Access? If so, does container creation itself have any reviewer, rate-limit, retention, or cleanup requirement we should account for?

#### 4. App and access-level confirmation

4.1 Please confirm that a dedicated Meta Business App configured for Instagram API with Instagram Login can use Standard Access with one company-owned or managed Instagram Professional account and the two permissions named above without App Review, while arbitrary client-owned accounts would require Advanced Access and App Review.

4.2 Please confirm that this Instagram Login App must remain separate from an existing App that uses Facebook Login, and identify any current Business Portfolio ownership, account-role, domain, redirect, or publication prerequisites that apply before the controlled Standard Access test.

Thank you. We will not implement or configure the integration until the lifecycle contracts above are clear. A question-by-question response with Instagram Login-specific documentation links would be greatly appreciated.

## Evidence Required to Unblock the Gate

A response is sufficient only if it provides, or explicitly confirms the absence of:

| Area | Required answer |
| --- | --- |
| Provider revoke | Instagram Login-specific method, host/path, identifier, token, scope, success/error semantics, or an explicit statement that no programmatic revoke is supported |
| Deauthorization | Trigger, exact payload/signature, subject semantics and mapping, replay/retry/acknowledgement rules |
| Data deletion | Applicability of the signed-request contract, subject mapping, response/status and deadline requirements |
| Media fetch | Supported request/redirect/range/header behavior, fetch/retry window, signed-URL support and safe TTL |
| App/access level | Applicability of the dedicated-App and Standard Access interpretation to the controlled account |

An answer that only links to Facebook Login documentation, repeats general Instagram overview text, or omits identifier/token semantics does not satisfy the Gate. If Meta confirms there is no supported programmatic revoke operation, the Gate remains blocked and the Human Owner must decide whether to amend the Baseline or choose a different login product.

## Placeholders for a Separately Authorized Submission

- Company/legal entity: `[ADD ONLY AFTER APPROVAL]`
- Dedicated Instagram App ID: `[NOT CREATED / DO NOT SUBSTITUTE THE FACEBOOK APP]`
- Support case ID: `[ASSIGNED BY META AFTER SUBMISSION]`
- Submitter and date: `[ADD AFTER AUTHORIZED SUBMISSION]`
- Meta response/evidence location: `[ADD AFTER RESPONSE]`

## Draft Verification

- The draft asks only for official product-contract clarification and does not request broader permissions or a policy exception.
- It distinguishes Instagram API with Instagram Login from Facebook Login for Business.
- It contains no credential, App ID, account identifier, signed URL, private endpoint, customer data, or provider response.
- It does not represent configuration, implementation, compatibility testing, submission, or external approval as completed.
