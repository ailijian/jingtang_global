# R5 Submission Readiness Bundle

> Transient, secret-free execution artifact for the R5 reviewer handoff and closure checklists. This file is not Product, Architecture, Integration-status, Scope-approval or external-platform authority. Resolve conflicts in favor of [`BASELINE.md`](BASELINE.md), [`PLAN.md`](PLAN.md), [`config/integrations.yaml`](../../../config/integrations.yaml), current code/contracts and the repository Knowledge Map. Never add passwords, one-time codes, access tokens, App Secrets, signed media URLs or private reviewer-account recovery data to this file.

## Status

- As of: 2026-08-29 (Asia/Shanghai).
- Overall: **IN PROGRESS — NOT SUBMISSION READY**.
- Authorized local scope: common regression/closure plus Facebook and TikTok reviewer-material preparation.
- Not authorized by the R5 start: deployment, credential rotation, Business/Domain Verification writes, Advanced Access/Audit requests, demo-video upload, external App Review submission, public availability, checkpoint, commit or push.
- Subsequent candidate authorization: after Revision 9 local review and Domain-property verification passed, the Human Owner authorized one candidate branch/commit/push containing the reviewed R4.5 provider-independent implementation held disabled plus Revision 9, solely to run blocking CI and stop at its result. This does not authorize deployment, provider credentials/API calls, publishing, App Review submission or public-status changes.
- Support contact: `developer@jingtangai.com`.

| Platform | Technical slice | R5 material state | Submission state | Blocking facts |
| --- | --- | --- | --- | --- |
| Facebook | R3 accepted and deployed for controlled access | Draft instructions, permission trace, data lifecycle and demo script assembled below | `not_ready` | Fresh official-policy/Dashboard verification, protected reviewer account, current screencast, Business Verification/Advanced Access and explicit submission authorization remain pending |
| TikTok | Historical R4 controlled private `SELF_ONLY` slice deployed; Revision 9 local transport candidate reviewed and Domain property verified | Draft instructions, Scope trace, data lifecycle and demo script assembled below | `url_property_verified_deployment_pending` | Private COS → provider-only `PULL_FROM_URL` implementation, local review and `review.jingtangai.com` verification pass; submission still waits for separately authorized deployment and fresh Human E2E |
| Instagram | I1～I3 provider-independent candidate reviewed; E1 partial | Blocker and partial configuration evidence recorded | `paused_not_ready` | Company-controlled Professional account registration/review did not yield a searchable account; Standard Access, OAuth/callback mapping, COS evidence, deployment and Human E2E are incomplete |

No row above is an external approval or a public availability claim. The Registry remains the machine authority and keeps every platform `Coming Soon` / `production_available: false`.

## Current Policy Revalidation

### Facebook

- The approved R3 sources and exact three-permission boundary remain recorded in [`R3_FACEBOOK_SCOPE_APPROVAL.md`](decision-inputs/R3_FACEBOOK_SCOPE_APPROVAL.md) and the Registry.
- On 2026-08-29, the official Meta pages could not be re-read by the automated evidence client because the Developer site returned HTTP 429. This is not evidence of a policy change and is not a revalidation pass.
- Stop condition: immediately before any submission write, a Human Operator must inspect the current App Review form, permission reference pages and actual App configuration, then reconcile every field with this bundle and the Registry.

### TikTok

- The official App Review Guidelines, Developer Guidelines and Content Sharing Guidelines were rechecked on 2026-08-29; the Registry records the current verification date.
- The App Review Guidelines require a functioning public-facing product, exact products/Scopes, an end-to-end demo from the actual web domain and reviewer-accessible capability. First-time review uses the Sandbox demonstration.
- Revision 9 closes the authority decision locally: server-stored media must use `PULL_FROM_URL`. The candidate retains private COS and exposes only the final-confirmed object through a provider-only HTTPS URL bound to object key, SHA-256, byte size, GET and a fixed 65-minute lifetime.
- URL-property evidence: the Human Operator verified `review.jingtangai.com` as a Domain property through TikTok's DNS TXT flow. Both GoDaddy authoritative nameservers and Google/Cloudflare public resolvers returned the record before TikTok reported `Verified`; no signed media URL, credential, API call, deployment or publish was used.
- Stop condition: do not submit the TikTok App or claim submission readiness. Local verification, Code Review and Dashboard URL-property verification pass; deployment and a fresh Human E2E remain separately authorized external evidence.

### Instagram

- No further provider-dependent policy or API work is authorized while R4.5 is paused.
- The dedicated App and exact Review redirect may remain as durable, non-secret configuration evidence. Empty callback fields must remain empty until a reviewed callback-capable deployment is separately authorized.

## Shared Reviewer Handoff Controls

The external reviewer receives credentials only through a protected out-of-band inventory. This repository and any demo video must contain only the inventory reference, never the credential value.

- [ ] Reviewer identity is a pre-created, current, least-privilege product account; public registration and self-service reset remain disabled.
- [ ] Reviewer account has an assigned Workspace and the minimum role needed to execute the documented commands.
- [ ] Credentials were rotated specifically for the review window and have an expiry/retirement owner.
- [ ] MFA/recovery handling is usable by the reviewer without publishing a fixed OTP or bypass.
- [ ] `https://review.jingtangai.com/login` returns the formal JINGTANG Workspace experience over HTTPS with `noindex`.
- [ ] English is selected for the recording and instructions; Simplified Chinese parity is checked separately.
- [ ] The approved MP4 is company-owned or licensed, under 500 MiB, hash/size frozen and contains no third-party watermark or confidential material.
- [ ] The recording shows user actions and resulting UI states without Developer Dashboard secrets, browser password-manager prompts, tokens, signed URLs, internal environment names or database/terminal access.
- [ ] Public website, Privacy, Terms, Data Deletion, Security and Integration pages are live and consistent with the app identity and support contact.
- [ ] Registry and public pages still say `Coming Soon`; reviewer access is controlled capability, not public availability.

## Facebook Reviewer Package Draft

### Exact permission-to-UI trace

| Permission | User-visible need | UI and user action | Provider operation boundary | Stored/minimized result |
| --- | --- | --- | --- | --- |
| `pages_show_list` | Let the user select the one Facebook Page they manage | Channels → Connect Facebook → permission explanation → explicit eligible Page selection | Read only the person's eligible Pages with minimum fields | Selected Page identifier/name and authorization evidence; removed/pseudonymized on disconnect/deletion |
| `pages_read_engagement` | Verify the selected Page and track only the video returned by the confirmed publish | Connected Page identity; Content Detail result for the returned video | Minimum selected-Page metadata and returned-video result fields | Exact selected Page snapshot and returned execution state; no feed, comments, insights or unrelated content sync |
| `pages_manage_posts` | Publish one approved MP4 to the selected Page | Content Review → Publish Confirmation → exact Page, MP4, title/description → explicit Publish Now command | Resumable upload and one Page-video create for the immutable intent | Provider video ID/URL and result until authorized-data cleanup; the Facebook-hosted copy is not represented as deleted |
| automatic `public_profile` | Bind the Meta login session | Facebook OAuth | Minimum login identity only | No Facebook email request |

Excluded permissions and products remain those owned by the Registry; they must not appear in the App request or demo.

### Reviewer instructions draft

1. Open `https://review.jingtangai.com/login`, choose English and sign in with the protected reviewer credential supplied outside this repository.
2. Open **Channels**, choose **Connect Facebook**, and read the displayed purpose and exact permission explanation.
3. Continue to Facebook, authenticate with the assigned reviewer Meta identity, grant only the displayed approved permissions, then select the single eligible controlled Page.
4. Verify that JINGTANG shows the exact connected Page identity and no Facebook feed, comments, messages, analytics or unrelated Pages.
5. Open **Content**, create a video item, upload the supplied approved MP4 directly to private storage, enter editable title/description and submit the revision.
6. Approve the submitted revision as an authorized Publisher/Owner command. Approval must not publish.
7. Open the final confirmation, verify the exact Facebook Page, MP4, title/description and Publish Now consequence, then issue the separate publish command once.
8. Observe per-platform processing/result state on Content Detail and compare it with the selected Page. Do not retry a successful or ambiguous external write as a new intent.
9. Open **Channels**, disconnect Facebook and observe immediate denial of new work plus provider revoke/local cleanup state. Explain that JINGTANG does not delete the already-published Facebook copy.
10. If the review explicitly covers callback/deletion handling, use Meta's native removal/data-deletion action and follow the displayed opaque status reference; do not fabricate callback payloads.

### Demo script and capture proof

- Opening slate: product name, official domain, support contact and the three requested permissions.
- Capture steps 1–10 above in one continuous, readable flow; the OAuth permission screen, Page selector, immutable confirmation and returned execution state must be legible.
- Add a brief on-screen mapping from each permission to the exact UI action. Do not claim that `pages_read_engagement` reads analytics or a Page feed.
- End with disconnect/deletion behavior and the public `Coming Soon` status.
- Current state: script complete; **current screencast not recorded or approved**.

### Data flow, retention and deletion references

- Current processors, environment isolation and Facebook flow: [`docs/security-and-data/README.md`](../../security-and-data/README.md).
- OAuth/token, callback, deployment and teardown procedure: [`docs/OPERATIONS.md`](../../OPERATIONS.md).
- Runtime contract and permission semantics: [`contracts/README.md`](../../../contracts/README.md), Registry and current Facebook adapter/routes.
- Human E2E and technical acceptance evidence: R3 section of [`PLAN.md`](PLAN.md).

### Facebook readiness checklist

- [ ] Current official policy and actual permission dependencies revalidated after the 2026-08-29 HTTP 429 limitation.
- [ ] Actual App name/icon/domain/legal/support fields inspected and match the public product.
- [ ] Business Verification and each required Advanced Access state recorded from the Dashboard.
- [ ] Protected reviewer account and controlled Page verified without storing credentials here.
- [ ] Fresh demo video recorded against the exact submission candidate.
- [ ] Every requested permission has matching written rationale, reviewer step and video timestamp.
- [ ] Human Owner separately authorizes the external submission write.

## TikTok Reviewer Package Draft

### Exact Scope-to-UI trace

| Product/Scope | User-visible need | UI and user action | Provider operation boundary | Stored/minimized result |
| --- | --- | --- | --- | --- |
| Login Kit / automatic `user.info.basic` | Bind the exact authorized TikTok account | Channels → Connect TikTok → OAuth; connected identity and final target account | OAuth token result `open_id`; no feed/profile-metrics endpoint | Minimum account binding and expiring display snapshot; removed on lifecycle cleanup |
| Content Posting API / `video.publish` | Post the one approved MP4 after fresh creator constraints and explicit confirmation | Content Review → current creator identity/privacy/interaction/disclosures → manual `SELF_ONLY` → Publish Confirmation | Creator Info, Direct Post init, media transfer and status for the returned `publish_id` only | Immutable confirmation, `publish_id` and truthful processing/result; no existing-post list |

No `video.upload`, `video.list`, Display API, Share Kit, photos, Webhooks or additional products/Scopes are requested. The transfer-mode blocker below must be closed before these materials can be submitted.

### Reviewer instructions draft

1. Open `https://review.jingtangai.com/login`, choose English and sign in with the protected reviewer credential supplied outside this repository.
2. Open **Channels**, choose **Connect TikTok**, and complete Login Kit with the assigned Sandbox user and automatic basic identity plus `video.publish`.
3. Verify that JINGTANG renders the connected account identity without reading an existing-video list or expanded metrics.
4. Create a video content item, upload the supplied approved MP4, enter an editable caption and submit it for approval.
5. Approve the revision as a separate authorized command; approval must not publish.
6. Open the TikTok platform version. Verify fresh Creator Info is reflected, privacy has no default, and Comment/Duet/Stitch are off unless both allowed and explicitly chosen.
7. Select `SELF_ONLY` manually for the unaudited controlled account, complete applicable commercial-content/AI disclosures and policy consent, then inspect the immutable confirmation.
8. Confirm the exact account, MP4, caption, privacy, interaction flags and disclosures, and issue Publish Now once.
9. Observe the returned processing/private-published or truthful failure state. Do not require or fabricate a public post URL for an unaudited `SELF_ONLY` result.
10. Disconnect TikTok and observe deny-first provider revoke, key retirement and local authorized-data cleanup. Explain that disconnect does not delete the TikTok-hosted post.

### Demo script and capture proof

- Opening slate: product, official domain, support contact, Login Kit, Content Posting API and exact `video.publish` Scope.
- Use the Developer Portal Sandbox as required for a first review, but record the integration inside the actual JINGTANG web domain.
- Capture Login Kit, current creator identity, manual privacy choice, interaction defaults, disclosures/consents, exact final confirmation, single publish command, result and disconnect.
- Show that no `video.upload`, draft-inbox flow, photo, existing-video list or public privacy is used.
- Current state: script complete; **current screencast not recorded or approved**.

### Transfer-mode policy blocker

Current architecture places the browser-uploaded source in private COS. Revision 9 requires the Worker to validate the final-confirmed MP4/hash/size and provide TikTok a provider-only `PULL_FROM_URL` grant without making COS public.

Required closure before submission:

- [x] Human Owner approved Revision 9 grounded in current policy and the private-COS/security constraints.
- [x] URL/domain ownership, 65-minute object/hash/size/GET-bound access, request mechanics and secret-equivalent handling are specified independently for TikTok.
- [x] Implementation, contracts, Registry, Security/Data, Operations and bilingual consent are updated coherently.
- [x] Full local verification and Code Review pass.
- [x] TikTok Dashboard verifies `review.jingtangai.com` as the owned Domain property for the provider-only media route.
- [ ] Controlled deployment and one separately authorized private Human E2E pass.
- [ ] Reviewer instructions and demo are regenerated from the final implementation.

### Data flow, retention and deletion references

- TikTok processor/data lifecycle and environment separation: [`docs/security-and-data/README.md`](../../security-and-data/README.md).
- Runtime OAuth/revoke, deployment and teardown: [`docs/OPERATIONS.md`](../../OPERATIONS.md).
- Exact Scope/API/UX authority: [`R4_TIKTOK_SCOPE_APPROVAL.md`](decision-inputs/R4_TIKTOK_SCOPE_APPROVAL.md), Registry and current adapter/routes.
- Human E2E and technical acceptance evidence: R4 section of [`PLAN.md`](PLAN.md) and historical [`R4_HANDOFF.md`](R4_HANDOFF.md).

### TikTok readiness checklist

- [x] Revision 9 local implementation, Code Review and `review.jingtangai.com` Domain-property verification pass; deployment/Human E2E evidence remains separate.
- [ ] Actual Production draft and Sandbox product/Scope/domain/legal fields match the final implementation.
- [ ] Protected reviewer account/Sandbox user verified without storing credentials here.
- [ ] Fresh end-to-end video recorded from the exact final web candidate and kept within current portal limits.
- [ ] Product and `video.publish` rationale, reviewer steps and video timestamps align.
- [ ] Audit/Review form accurately states current private-only behavior and intended public product use.
- [ ] Human Owner separately authorizes the external submission write.

## Instagram Pause Record

Completed E1 evidence:

- A separate Meta Business App was created under the `Jingtang` Business Portfolio for the Instagram Login use case.
- The direct Instagram API with Instagram Login path was selected; the broader Facebook Login route was not used.
- The exact Review OAuth redirect was saved.
- Dashboard configuration exposed distinct **Deauthorization Callback URL** and **Data Deletion Request URL** fields. They were left empty because the corresponding verified provider routes are not deployed.
- The R3 Facebook App was not selected or modified during these steps.

Blocker and decision:

- The new company-controlled Instagram account used the company developer email but did not complete registration/review in a state searchable by the Meta App tester picker.
- Without a searchable controlled Professional account, Instagram tester binding, Professional status, Standard Access, OAuth, user removal, callback signature/subject/replay/response mapping and COS compatibility cannot be proven.
- The Human Owner declined to use a personal account and paused Instagram development on 2026-08-29.
- The App stays unpublished and Instagram stays `Coming Soon`; no guessed callback, external credential, provider call or publish is permitted.

Resume only after the Human Owner explicitly restarts R4.5 and a company-controlled searchable Professional account exists. Then continue at E1; do not skip to I4, deployment, App Review or publishing.

## Release-Truth and Full Regression Checklist

- [x] Canonical `pnpm verify` passes on the final local candidate: 217 unit tests, all database integration suites, nine platform E2E, seven site E2E, 30 migrations, backup/restore and a 426-file Secret scan passed on 2026-08-29.
- [x] `pnpm site:release-check` outcome is reconciled with the actual public legal/version deployment state: it correctly failed closed because `2026-08-28-r4.5` remains pending separate production-change authorization.
- [x] Live read-only website truth checks passed all 19 authoritative English/Simplified Chinese routes and exact Sign in links; the live site accurately exposes the deployed `2026-08-28` policy marker rather than the undeployed candidate version.
- [x] Live read-only Review checks passed HTTPS health and login `200`, `noindex`, container health, zero restarts and active/enabled backup and capacity timers without printing Secret values.
- [x] Tenant/RBAC, upload, submit/approve, confirmation, publish/result, disconnect/revoke/delete, migration, backup/restore, i18n, mobile/accessibility and secret scans pass through the canonical suite.
- [x] Public pages contain no prohibited internal Delivery/environment terminology and do not claim Schedule, public platform availability or third-party approval.
- [x] Registry is consistent with actual deployed and external state, including the Instagram pause, the completed TikTok local remediation and the undeployed historical Review runtime.
- [x] Final R5 diff and the preserved, previously reviewed I1～I3 worktree boundary were reviewed for unintended scope expansion and Secret/identifier leakage; no blocking R5 documentation/Registry finding remains.

## Teardown and Migration Checklist

This checklist is a handoff index; the executable procedure remains owned by [`docs/OPERATIONS.md`](../../OPERATIONS.md) and [`infra/tencent/MANUAL_DEPLOYMENT.md`](../../../infra/tencent/MANUAL_DEPLOYMENT.md).

- [ ] Before Review teardown, migrate the official Sign in target to a verified replacement or publish an accurate unavailable state and prove both locales have no dead link.
- [ ] Deny Review access and stop new external work before stopping the Worker.
- [ ] Reconcile or safely cancel durable jobs; never turn an ambiguous provider write into a second publish.
- [ ] Run each configured platform's approved disconnect/revoke/removal flow and retire each per-connection key.
- [ ] For paused Instagram, keep local state/provider execution absent; if any later authorization exists, require manual App removal and treat callback confirmation separately.
- [ ] Revoke Review OAuth/CAM credentials, rotate durable App Secrets as required, remove Review redirect/callback URLs and destroy the local envelope root/key store.
- [ ] Delete Review Workspace/source objects and isolated volumes under existing retention/deletion controls; retain only minimized approved evidence.
- [ ] Verify encrypted backups and object versions expire under the approved schedule and the unused OAuth-key Bucket is empty before deletion.
- [ ] Detach the Review Caddy route only after the official website handoff is verified.
- [ ] Verify `jingtangai.com` HTTPS, bilingual routes, legal pages and Integration truth after teardown.
- [ ] Future production uses independent controlled resources and repeats applicable Gates; never promote the Review environment in place.

## R5 Stop Conditions

R5 may continue local regression and material preparation, but it must stop before any of the following without fresh authority:

- changing the approved TikTok product/transport boundary beyond Revision 9;
- provisioning or transmitting reviewer credentials;
- changing external App settings beyond separately authorized evidence;
- recording or uploading a demo that performs an unapproved external write;
- Business/Domain Verification, Advanced Access/Audit or App Review submission;
- deployment, public `Available`, Stage Acceptance, checkpoint, commit or push.

R5 cannot be marked complete while Instagram remains paused under the current Baseline, TikTok deployment/fresh Human E2E evidence remains absent, required current demo videos/reviewer accounts are absent, or Final Acceptance/Human E2E/Stage Acceptance have not been explicitly completed.
