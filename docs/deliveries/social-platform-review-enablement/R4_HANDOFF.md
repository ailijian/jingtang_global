# R4 TikTok Acceptance Remediation Handoff

> Transient execution handoff for continuing this Delivery in a new Codex window. This file is not product, architecture, integration-status, or approval authority. Resolve any conflict in favor of [`BASELINE.md`](BASELINE.md), [`PLAN.md`](PLAN.md), `config/integrations.yaml`, current code/contracts, and the repository Knowledge Map.

## Resume Point

- Date: 2026-08-28 (Asia/Shanghai).
- Local branch: `main` at `54df1e60aa65ba35fbabbdc13537300d5b064bd7` (`fix(review): close TikTok disconnect lifecycle`) plus uncommitted Acceptance remediation.
- Review deployment: `current-release` remains `54df1e60aa65ba35fbabbdc13537300d5b064bd7`; the remediation in this working tree has not been deployed.
- Git synchronization: local `main` remains ahead of `origin/main`; neither the existing R4 commits nor this remediation have been pushed.
- Current Delivery state: the private Direct Post and final disconnected/cleaned state were observed, but the 2026-08-28 Acceptance Review returned `FAIL`. The local remediation passed canonical self-verification; R4 Code Review, deployment, complete Human E2E evidence, Acceptance Review and Stage Acceptance are pending.

## Frozen Authority Boundary

Authorized in the current R4 scope:

- Review-only Web Login Kit and Content Posting API Direct Post Video.
- Automatic `user.info.basic` and exactly `video.publish`.
- `FILE_UPLOAD` only; one controlled private account; manual `SELF_ONLY` only.
- Repair the recorded Acceptance Review findings locally, run final self-verification, and prepare the resulting state for the required Code Review and re-review.

Not authorized without a fresh Human Owner instruction:

- `git push`, repository synchronization, checkpoint, merge, or release promotion.
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
- Deployed commit `54df1e6` fixed the TikTok lifecycle database policy, audit platform value, generic reauthorization cleanup, main-card progress/failure state and bounded status refresh.
- Full pre-deploy verification passed on `ac2a5f6`: formatting, lint, typecheck, production builds, Terraform/release checks, 185 unit tests, contracts/i18n, migrations and all database integration suites, eight platform E2E, seven site E2E, operations/backup-restore/security checks and Secret scan.
- Incremental deployment reused dependency layers: an approximately 401 MB release archive required approximately 127 MB transfer. Activation automatically pruned superseded releases/images and retained the current plus one rollback release.
- Review health and `noindex`/`robots.txt` checks passed; backup and capacity timers are enabled and active.
- One moderate production dependency advisory remains below the repository's blocking `high` audit threshold.
- The 2026-08-28 Acceptance Review found four blocking categories: user-facing `R4`/`Pilot` language; missing TikTok Architecture/Security/Data/legal/versioned-consent authority; no attributable Code Review for the final state; and live lifecycle evidence that included one protected administrator retry wake.
- Current local remediation removes the internal product wording, adds a release regression, records the durable TikTok App exception, adds TikTok processor/data-flow/retention/deletion authority, updates bilingual Privacy/Terms/Data Deletion copy, and advances the runtime policy/consent version to `2026-08-28`.
- The final local remediation passed `pnpm verify` on 2026-08-28: formatting, lint, typecheck, builds, Terraform/release checks, 185 unit tests, contracts, 629-key bilingual catalog parity, site checks, all migrations and integration suites, platform/site E2E, operations/backup-restore controls and Secret scan passed. One moderate production dependency advisory remains below the blocking `high` threshold.

## Remaining Work, in Order

1. Read `AGENTS.md`, `docs/README.md`, the approved `BASELINE.md`, current `PLAN.md`, this handoff, and the current authorities before acting. Preserve unrelated working-tree changes.
2. Run the PLAN-required final Code Review on the full R4 change boundary, including `54df1e6` and this remediation. Fix any blocking finding and reverify.
3. Deployment of the legal/versioned-consent and product-copy remediation requires separate Human Owner authorization. Until deployed, `config/public-site.yaml` truthfully records the new legal policy rollout as pending.
4. AC-10 still needs independently observed no-manual-database lifecycle evidence. Reconnecting TikTok is not currently authorized; another private publish is neither required nor authorized. Obtain explicit authority before any provider reconnection or other external action.
5. After all prerequisite Gates and applicable deployed evidence are complete, rerun R4 Acceptance Review against AC-08, AC-10 and AC-12. Keep TikTok `coming_soon`, every public capability `not_available`, and `production_available: false`.
6. Stop after reporting the re-review result. Stage Acceptance, checkpoint, push/synchronization, R5 materials, Production Developer Portal configuration, external App Review and public availability remain separately gated.

## Useful Read-Only Checks

```bash
git status --short
git log -1 --oneline --decorate
git rev-list --count origin/main..HEAD
ssh jingtang-production "sudo cat /srv/jingtang/review/current-release; docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}'"
curl -fsS -D - https://review.jingtangai.com/api/v1/health -o /dev/null
```

Use repository/operator procedures for any further deployment. Never print runtime Secret values.

## Suggested First Prompt in the New Window

```text
Continue the R4 TikTok Acceptance remediation from docs/deliveries/social-platform-review-enablement/R4_HANDOFF.md. Read AGENTS.md, docs/README.md, the approved BASELINE.md, current PLAN.md, Architecture, Security/Data, public-site config and config/integrations.yaml first. Preserve the current working tree. Do not commit, deploy, reconnect TikTok, publish another video, push, checkpoint, submit TikTok review, configure Production or enable public availability without explicit authority. Start by confirming the remediation diff and verification status, then complete the required Code Review and prepare the re-review evidence.
```
