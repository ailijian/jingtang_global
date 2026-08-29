# R4 TikTok Acceptance Review Handoff

> Transient execution handoff for continuing this Delivery in a new Codex window. This file is not product, architecture, integration-status, or approval authority. Resolve any conflict in favor of [`BASELINE.md`](BASELINE.md), [`PLAN.md`](PLAN.md), `config/integrations.yaml`, current code/contracts, and the repository Knowledge Map.

> Revision 9 supersession (2026-08-29): the `FILE_UPLOAD` boundary and evidence below are historical only. Current authority requires private-COS, provider-only `PULL_FROM_URL`. No prior deployment or Human E2E evidence proves the new transfer path.

## Resume Point

- Date: 2026-08-28 (Asia/Shanghai).
- Local branch: `codex/r4-acceptance-prep`; reviewed implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc` contains the endpoint-boundary and Registry repair. Draft PR #1 must not be merged without fresh authority.
- Review deployment: `current-release` is `a03133e4188c191d0e70d507cbf654da9c66d8cc`, activated under `change-20260828-r4-endpoint-allowlist`. Platform/PostgreSQL are healthy, Worker and website are running, all four containers have zero restarts, HTTPS health is `200` with `noindex`, and both maintenance timers are active and enabled.
- Public website deployment: the immutable `e2c015b82b25eb788a3fca209badc0f89a3f9753` release is live. Protected CI run `33154279952` and deployment workflow run `33154699475` passed; independent smoke passed all 19 HTTPS routes and the bilingual legal pages expose version `2026-08-28`.
- Git synchronization: the authorized temporary branch was pushed to run protected CI. Local/remote `main`, merge and repository synchronization remain untouched and unauthorized. The Human Owner separately authorized local R4 checkpoint creation after Acceptance Review passed.
- Current Delivery state: R4 Acceptance Review and technical Stage Acceptance passed on 2026-08-28. The final re-review evaluated repository evidence commit `ab93c4192665454d68d215d97b758e1624b2ce1f` and deployed implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc`; AC-08, AC-10 and AC-12 passed with no blocking finding. R4 is technically closed at the local checkpoint. Public TikTok availability, external audit/App Review submission, R5 execution, merge, push and repository synchronization remain separately gated.

## Frozen Authority Boundary

Completed under the current R4 scope and explicit deployment authorization:

- Review-only Web Login Kit and Content Posting API Direct Post Video.
- Automatic `user.info.basic` and exactly `video.publish`.
- `FILE_UPLOAD` only; one controlled private account; manual `SELF_ONLY` only.
- Repair the recorded Acceptance Review findings, run final self-verification and Code Review, push the temporary branch for protected CI, deploy the legal/privacy version to the public website, and deploy the endpoint-boundary repair to Review.

Not authorized without a fresh Human Owner instruction:

- Additional `git push`, repository synchronization, merge, or release promotion.
- TikTok Production configuration, external audit/App Review submission, or public `Available` status.
- A second TikTok post, a public post, `PULL_FROM_URL`, `video.upload`, additional Scope/Product, or a new target account.
- Facebook/TikTok reviewer material submission. Those external applications remain in the separately gated R5 unified submission stage.

## External Configuration Already Completed

- TikTok Organization ID: `7678667255361717268`.
- Durable TikTok App ID: `7678647396784326677`.
- Sandbox ID: `7678676933508892692`.
- Sandbox target user: `lijiancn`.
- Review redirect URI: `https://review.jingtangai.com/api/v1/channels/tiktok/oauth/callback`.
- Products: Login Kit Web and Content Posting API with Direct Post enabled.
- Scope set: automatic `user.info.basic`; requested `video.publish`; no `video.upload`, `video.list`, Share Kit, Display API, Webhooks, or other products.
- Media mode: `FILE_UPLOAD`; domain-pull transfer is not part of R4.
- `jingtangai.com` URL ownership was configured through DNS so the Sandbox form and legal URLs could be saved.
- Brand assets are already in the repository at `apps/site/public/brand/jingtang-app-icon-1024.png`, `apps/site/public/brand/jingtang-logo.png`, and the site/platform app icon paths.
- The Sandbox Client Secret is installed on the Review host through the root-only external-secret workflow. Do not display, copy into chat, or commit it.

The Production draft was intentionally not submitted. Do not complete or submit it during R4 closure unless the Human Owner separately authorizes the R5/external-review activity.

## Implemented and Verified

- OAuth connect, state binding, token refresh/revocation, Creator Info, manual Privacy, disclosures/consents, immutable confirmation, FILE_UPLOAD streaming, publish initialization/status recovery, disconnect/delete, audit, contracts, bilingual UI and Review runtime wiring are implemented.
- Successful private publish content: `7f888d73-37e2-4417-aa52-414abefc8831` on `https://review.jingtangai.com`.
- The successful execution is shown as privately published. For an unaudited `SELF_ONLY` TikTok post, absence of a public external post URL is allowed; JINGTANG must not fabricate one.
- Deployed commits through `9fc8e25` fixed the TikTok lifecycle database policy, audit platform value, generic reauthorization cleanup, main-card progress/failure state, successful intermediate outcome classification and bounded automatic status refresh.
- Full pre-deploy verification passed on `ac2a5f6`: formatting, lint, typecheck, production builds, Terraform/release checks, 185 unit tests, contracts/i18n, migrations and all database integration suites, eight platform E2E, seven site E2E, operations/backup-restore/security checks and Secret scan.
- Incremental deployment reused dependency layers: an approximately 401 MB release archive required approximately 127 MB transfer. Activation automatically pruned superseded releases/images and retained the current plus one rollback release.
- Review health and `noindex`/`robots.txt` checks passed; backup and capacity timers are enabled and active.
- One moderate production dependency advisory remains below the repository's blocking `high` audit threshold.
- The 2026-08-28 Acceptance Review found four blocking categories: user-facing `R4`/`Pilot` language; missing TikTok Architecture/Security/Data/legal/versioned-consent authority; no attributable Code Review for the final state; and live lifecycle evidence that included one protected administrator retry wake. That review result remains historical and has not been overwritten.
- The deployed remediation removes internal product wording, adds the release regression, records the durable TikTok App exception, adds TikTok processor/data-flow/retention/deletion authority, updates bilingual Privacy/Terms/Data Deletion copy, advances policy/consent to `2026-08-28`, and fixes the disconnect UI's terminal-state polling.
- Final candidate `e2c015b` passed `pnpm verify` on 2026-08-28: formatting, lint, typecheck, builds, Terraform/release checks, 203 unit tests, contracts, 629-key bilingual catalog parity, site checks, all 29 migrations and database integration suites, eight platform E2E, seven site E2E, operations/backup-restore controls and Secret scan. One moderate production dependency advisory remains below the blocking `high` threshold. The full R4 Code Review found no open P1/P2 finding, and protected CI passed the same commit.
- AC-10 no-intervention evidence is complete. Operation `0fbac636-898a-4cd9-8bf2-7faf26793549` entered a scheduled retry and was automatically claimed for attempt 2 at its due time; it completed at `2026-08-28 07:27:45.868 UTC` with all three disconnect steps complete. The TikTok Channel is disconnected and every identity/scope/consent/authorization/token field is absent. No database wake, reconnect or second publish was used.
- The second Acceptance Review found that `GET /v2/user/info/` was not in the approved R4 endpoint allowlist even though it used the automatic `user.info.basic` scope. The deployed repair removes that provider operation everywhere, binds identity from the token `open_id`, uses approved Creator Info for the initial display snapshot, clears the expiring display snapshot during retention refresh, and adds an exact endpoint-allowlist Review release check. The Registry detailed Code Review/Human E2E state is also aligned.
- The first Code Review of the current repair returned `FAIL` with one P1 and one P2: clearing the expired TikTok display snapshot made the otherwise-valid Channel fail authorization reads, and the modified retention test used a YouTube fixture rather than proving the TikTok behavior. The authorization read now permits the nullable display snapshot, YouTube display-refresh semantics are restored, and a real TikTok retention regression proves the refreshed token/open-id binding remains usable after snapshot deletion.
- Implementation commit `a03133e4188c191d0e70d507cbf654da9c66d8cc` passed the complete `pnpm verify`: formatting, lint, typecheck, builds, Terraform/release checks, 203 unit tests, contracts, 629-key bilingual catalog parity, site checks, all 29 migrations and database integration suites including the new TikTok retention regression, eight platform E2E, seven site E2E, operations/backup-restore controls and Secret scan. One moderate production dependency advisory remains below the blocking `high` threshold.
- The final Code Review rerun returned `PASS` with no open P0/P1/P2 finding for that exact implementation commit, and protected CI run `33160273495` passed it.
- The immutable Review archive passed local and remote SHA256 verification. Activation recorded `a03133e4188c191d0e70d507cbf654da9c66d8cc` and `change-20260828-r4-endpoint-allowlist`; all 29 migrations were already applied. Independent checks passed exact image revisions, HTTPS health/noindex/method behavior, login, 19 website routes, zero restarts, active/enabled timers, capacity, absence of the endpoint from the deployed adapter/platform executable surface and zero recent platform/worker error event. No reconnect or new publish was performed.

## Remaining Work, in Order

1. Stop. R4 is technically accepted and checkpointed; do not begin R5 without a fresh Human Owner instruction.
2. Keep TikTok `coming_soon`, every public capability `not_available`, and `production_available: false` until the separately gated external review and public-release work passes.

## Useful Read-Only Checks

```bash
git status --short
git log -3 --oneline --decorate
git rev-list --count origin/main..HEAD
ssh jingtang-production "sudo cat /srv/jingtang/review/current-release; readlink /srv/jingtang/public-site/current; sudo docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
curl -fsS -D - https://review.jingtangai.com/api/v1/health -o /dev/null
```

Use repository/operator procedures for any further deployment. Never print runtime Secret values.

## Suggested First Prompt in the New Window

```text
R4 passed Acceptance Review and technical Stage Acceptance on 2026-08-28 and has a local checkpoint. Read AGENTS.md, docs/README.md, the approved BASELINE.md, current PLAN.md and config/integrations.yaml before continuing. Stop unless the Human Owner explicitly authorizes the next separately gated action. Do not reconnect TikTok, publish another video, merge, push, synchronize repositories, begin R5, submit TikTok review, configure Production or enable public availability without that authority.
```
