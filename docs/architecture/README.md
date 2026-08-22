# JINGTANG Current Architecture Authority

- Status: Approved
- Architecture Revision: 6
- Effective Date: 2026-08-22
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Baseline: [`docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md`](../deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Approved Revision 2
- Design input: [`docs/deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md`](../deliveries/jingtang-overseas-website-saas-v1-launch/DESIGN_AUTHORITY.md), Approved Revision 1
- Owner: JINGTANG Architecture Owner
- Approval owner: JINGTANG Human Owner

## Authority Boundary

This document owns the current implementation architecture: system and module boundaries, technology and deployment choices, environment and regional topology, identity and tenant boundaries, persistence and asynchronous execution, secrets and observability boundaries, and the location of machine contract, migration, verification, and CI owners.

It does not own or restate Delivery goals, scope, product acceptance criteria, material UX meaning, legal copy, public capability claims, retention policy, or individual contract payloads. Those remain owned by the Approved Baseline, Approved Design Authority, [`docs/security-and-data/README.md`](../security-and-data/README.md), [`contracts/`](../../contracts/), and [`config/integrations.yaml`](../../config/integrations.yaml), respectively.

The decisions below are build constraints after Human Owner approval. Exact dependency patch versions and non-material library substitutions are implementation details and must be locked and verified in D2.

## Architecture Decisions

| ID | Decision | Consequence |
| --- | --- | --- |
| A-01 | Use a TypeScript monorepo on the current Active LTS Node.js line, with `pnpm` workspaces. | Website, SaaS, worker, contracts, and infrastructure share types and tooling without becoming one deployable. |
| A-02 | Use a modular monolith with three deployables: a public Next.js website, a Next.js SaaS/BFF, and a Node.js asynchronous worker. | D3 can launch the website independently; domain rules stay in modules; external platform work never runs in a browser request. |
| A-03 | Use PostgreSQL as the transactional system of record, Tencent Cloud COS for private source assets, a transactional outbox plus Tencent Distributed Message Queue for asynchronous work, and Tencent Cloud SES for transactional email. Keep the existing S3-compatible asset adapter only where it conforms to the COS endpoint and security contract. | Workspace, approval, intent, execution, and audit writes can commit atomically; large media does not pass through application memory; provider-specific code stays behind adapters. |
| A-04 | Use Tencent Cloud CIAM for production sign-up, login, logout, password reset, and credential policy. Use server-managed secure sessions in the SaaS; keep Workspace membership and roles in PostgreSQL. | JINGTANG does not store passwords; application authorization remains tenant-aware and independent of the identity provider. The currently implemented Cognito adapter is transitional and is not an approved production identity path after Revision 5. |
| A-05 | Deploy production SaaS application data and compute in Tencent Cloud Singapore. A deployed integration stack, when present, remains logically isolated even when it shares a Human-controlled Tencent host. Before those resources exist, D5 may use the protected local test harness with the Google Cloud Test project and Human-owned test media solely to prove the real OAuth/API slice; that harness is not a production, reviewer, or deployed integration environment. | Production and any deployed integration stack use separate databases, buckets, queues, keys, secrets, logs, OAuth clients, configuration namespaces, and network exposure. The D5 local exception never authorizes production credentials, public capability rollout, or substitution for D7 production evidence. |
| A-06 | Use Terraform with the Tencent Cloud provider for SaaS infrastructure as code and GitHub Actions for blocking CI. Production deployment requires a protected GitHub Environment and a human approver; cloud access uses short-lived federation rather than stored general-purpose keys where the selected Tencent service supports it. | Infrastructure changes are reviewable; the design does not depend on an AWS account or AWS CDK. |
| A-07 | Expose versioned REST/JSON under `/api/v1`. JSON Schema 2020-12 owns payload shapes; OpenAPI 3.1 owns HTTP operations; AsyncAPI 3.x owns asynchronous channel bindings. | Contracts can be validated independently of runtime code and referenced by reviewer evidence. |
| A-08 | Use Prisma as the PostgreSQL schema and migration owner. Every table carrying tenant data has a non-null `workspace_id`; PostgreSQL row-level security (RLS) and application authorization are both required. | Tenant isolation has two enforceable layers. Migrations use expand/migrate/contract sequencing. |
| A-09 | Represent workflow lifecycle, publishing intent, and each platform execution separately. An explicit confirmation creates one immutable intent snapshot and one execution per selected account. | Approval is not publish, partial failure stays visible, and retries are scoped to an execution rather than the whole Content. |
| A-10 | Store production secrets in Tencent Cloud Secrets Manager. Envelope-encrypt OAuth tokens per connection with Tencent Cloud KMS; tokens and platform secrets are server/worker-only. Local envelope encryption is permitted only with synthetic data in local/test environments and is rejected for deployed OAuth configuration. | A connection can be cryptographically erased, and tokens cannot be serialized into browser responses, ordinary logs, analytics, or error payloads. |
| A-11 | Use structured JSON logs, OpenTelemetry-compatible traces, Tencent Cloud CLS and Cloud Monitor metrics/alarms, and a separate append-only audit-event store. | Technical telemetry and user-visible audit history have different schemas and retention; correlation is by opaque IDs. |
| A-12 | YouTube is the first production integration slice. No other platform adapter or permission is built in this Delivery. Schedule remains disabled until a later verified capability decision. | The build stays aligned with the PLAN and truthful public status registry. |
| A-13 | Treat `en` and `zh-CN` as first-class application locales, with English as the safe default. Use one versioned message-catalog package across the website, SaaS and server-generated user messages; persist an authenticated user locale preference and keep public website locale routes stable. Machine status/permission values remain language-neutral, and user-authored content is never translated by locale switching. | Translation cannot fork domain meaning or capability truth; SSR and client hydration resolve the same locale; the UI can switch languages without recreating Workspace, draft, task or external-write state. |
| A-14 | Host the D3 static public website on the Human-controlled Tencent Cloud Lighthouse production instance in Seoul. Serve the immutable Next.js export through a pinned Caddy container, obtain and renew the `jingtangai.com` certificate through ACME, keep DNS at the Human-controlled registrar, and deploy atomically over dedicated SSH access. | The public website remains independently deployable and has no application database or secret. A-03～A-06 and A-10 continue to govern the not-yet-production SaaS/worker boundary; this D3 amendment does not silently migrate those future data services. |

## Repository and Module Boundaries

D2 creates the following implementation locations. Their absence during D0 is intentional.

```text
apps/
├── site/                 public website; no authenticated product data
├── platform/             SaaS UI, BFF, REST API, session boundary
└── worker/               outbox dispatch and platform execution

packages/
├── domain/               Workspace, RBAC, Content, Approval, Intent, Execution
├── application/          use cases and authorization policies
├── db/                   Prisma schema, RLS policies, migrations, repositories
├── integrations/         adapter interfaces; YouTube implementation begins D5
├── observability/        redaction, logs, traces, metrics, audit emission
├── i18n/                 en/zh-CN catalogs, glossary, formatters, locale resolution
└── ui/                   D1-derived components and tokens

contracts/                machine-readable payload/API/event authority
config/integrations.yaml  public and product integration capability truth
infra/                    Tencent website runtime configuration; the existing D2 AWS CDK scaffold is obsolete and must be replaced by Tencent Terraform before SaaS deployment
```

Dependencies point inward: deployables may depend on application/domain packages; domain packages do not import UI, Tencent Cloud, CIAM, Prisma, TDMQ, or YouTube SDKs. Platform adapters implement interfaces defined at the application boundary. Cross-module writes go through application use cases, not direct table access.

## Runtime and Deployment Topology

### Public website

- Next.js static output is deployed as an immutable release under `/srv/jingtang/public-site/releases/` on the Human-controlled Tencent Cloud Lighthouse instance in Seoul and activated through a `current` symlink.
- A pinned Caddy container serves only the static website, terminates TLS 1.2+, renews the `jingtangai.com` ACME certificate, emits bounded access logs, and applies the repository-owned security-header policy.
- GoDaddy remains the authoritative DNS provider. The website deploys independently over a dedicated SSH key so D3 does not expose an incomplete SaaS or require long-lived general cloud credentials in CI.
- Authenticated SaaS pages, account data, user content, OAuth responses, API data, and platform secrets are prohibited from this host and deployment artifact.

### SaaS and worker

- The SaaS/BFF and worker run as separate containers on a dedicated Human-controlled Tencent Cloud compute host in Singapore; moving those workloads to TKE later is an operational change that must preserve the same boundaries.
- Tencent Cloud Load Balancer or a dedicated Caddy ingress terminates public SaaS HTTPS traffic. TencentDB for PostgreSQL, TDMQ, COS, Secrets Manager, and KMS are not public.
- TencentDB for PostgreSQL uses the selected production high-availability and backup controls. COS buckets deny public access, use versioning, KMS encryption, and lifecycle rules.
- TDMQ queues use a dead-letter queue. The worker uses bounded retry with jitter and idempotency keys; it does not infer user consent from a retry.

### Environments

| Environment | Isolation | External platform rule |
| --- | --- | --- |
| local/test | Local or ephemeral application resources; synthetic fixtures by default. D5 additionally permits protected Human-owned test media and an allow-listed account only for the recorded real Google Test-project OAuth/private-upload proof. | Allow-listed test users/channels; qualifying uploads remain private; no production credential; no Available claim |
| integration | Isolated container/configuration namespace using separate database, bucket, queue, key, secret and log destinations; it may share a dedicated Tencent host but never a production namespace | Google Cloud Test project only; protected access; capability never marked Available |
| production | D3 public website remains isolated on the Tencent Cloud Lighthouse host in Seoul; SaaS/worker target a dedicated Tencent compute boundary in Singapore; Google Cloud Production project is separate | Verified domains, protected deploy, least privilege, required Google verification/audit and truthful private-upload limitation |

No database, bucket, KMS key, queue, OAuth client, redirect URI, secret, or log destination is shared between integration and production.

## Identity, Tenant, and RBAC Boundary

1. Tencent Cloud CIAM authenticates a human and returns an immutable external subject identifier. The existing Cognito adapter is a transitional implementation only and cannot be selected for the Revision 5 production deployment.
2. The BFF maps that subject to an internal `user_id`; no tenant is accepted from an unsigned browser claim.
3. Each request selects a Workspace from server-side membership and establishes `workspace_id`, `user_id`, and permission context for the transaction.
4. The application permission check is deny-by-default. PostgreSQL RLS then restricts tenant rows using the transaction-local Workspace context.
5. Background jobs carry immutable `workspace_id`, actor/intent identifiers, and an idempotency key. The worker re-authorizes the stored intent and channel state before any external write.
6. Owner/Admin is the administrative super-role and may perform all V1 actions, but approval and external publish still require separate explicit commands. Editor, Approver/Publisher, and Viewer permissions follow the matrix owned by `contracts/README.md`.

Global cross-tenant application queries are prohibited. Operational support access uses a time-bound production role, reason/ticket reference, and audit record; it does not bypass database policy through shared application credentials.

## Persistence and Migration Ownership

- PostgreSQL owns durable business state. COS owns immutable asset objects; the database owns object metadata and lifecycle state.
- Prisma schema and migrations under `packages/db/` are the only persistence schema owner after D2.
- Every migration must support a forward deploy from the previous released schema. Breaking changes use expand → backfill → switch readers/writers → contract in a later release.
- Destructive rollback is not the default. Rollback means application rollback while the expanded schema remains compatible, or restore to a separately provisioned database under the documented recovery procedure.
- A migration may not drop tenant, audit, consent, execution, or deletion evidence until its retention and legal implications are reviewed by the Security/Data Owner.

## Platform Execution Boundary

The synchronous request path ends after it validates the exact approved revision, selected account(s), final platform fields, publishing mode, actor permission, consent version, and channel authorization state.

Within one database transaction it writes:

1. an immutable Publishing Intent snapshot;
2. one Platform Execution per selected channel/account;
3. outbox messages referencing those executions;
4. audit events for the confirmation.

In every deployed integration or production environment, the dispatcher publishes outbox messages to TDMQ. The worker consumes one command, claims one execution, rechecks revocation/deletion state, performs the adapter call with an idempotency key, and records the platform ID/URL and real result. `publishing`, `processing`, `published`, `failed`, `needs_attention`, and `cancelled` are per-execution outcomes. No aggregate status may overwrite them.

The protected D5 local test harness may lease and process the PostgreSQL outbox directly in its single worker deployable. This local adapter must preserve the same immutable intent, tenant, idempotency, bounded retry and conservative ambiguous-result behavior, but it is not TDMQ evidence. D7 remains blocked until the production dispatcher → TDMQ → worker path and its dead-letter/retry behavior are implemented and verified.

Disconnect or deletion writes a deny marker before asynchronous cleanup starts. Workers must reject new or queued calls for denied connections. Token revocation and deletion behavior is owned by `docs/security-and-data/README.md`; UI meaning remains owned by the Design Authority.

## Secrets, Tokens, and Logs

- Browser bundles and public runtime configuration contain only explicitly public values.
- OAuth authorization codes terminate at the BFF callback and are exchanged server-side. Refresh/access tokens are envelope-encrypted before database persistence.
- Each connection has a unique encrypted data key. Deleting its wrapped key makes token ciphertext in live storage and backups unusable.
- Logs use allow-listed fields. Authorization headers, cookies, OAuth codes/tokens, signed URLs, raw asset bytes, platform secrets, final content text, and personal email addresses are prohibited.
- User-visible failures use stable error codes and safe explanations; raw provider responses remain in restricted, redacted technical evidence only when required.

## Canonical Verification and CI Locations

D2 must make the following real commands canonical in the root `package.json`; D0 does not claim that they already exist:

| Check | Canonical command name | Machine owner |
| --- | --- | --- |
| formatting | `pnpm format:check` | root scripts and formatter config |
| lint | `pnpm lint` | root scripts and lint config |
| static types | `pnpm typecheck` | TypeScript project references |
| build | `pnpm build` | workspace build graph |
| unit | `pnpm test:unit` | test runner config |
| contract | `pnpm test:contract` | `contracts/` schemas and compatibility fixtures |
| localization | `pnpm test:i18n` | `packages/i18n/` catalog parity, missing keys, locale routes, SSR/hydration fixtures |
| migrations/RLS | `pnpm test:migration` | disposable PostgreSQL harness |
| integration | `pnpm test:integration` | app/database/queue harness |
| E2E | `pnpm test:e2e` | browser E2E config |
| security | `pnpm test:security` | dependency, secret, and policy checks |
| all blocking | `pnpm verify` | root script composing all required checks |

`.github/workflows/ci.yml` will run `pnpm verify` from a clean checkout with no production secret. Deployment workflows live separately and cannot substitute for CI.

## Human Identity and External Readiness Register

Repository records contain no secret values. Functional owners are accountable now; a named assignee and evidence link must be recorded in the relevant protected system before the indicated Gate.

| Item | Current evidence | Accountable owner | Freeze/evidence entry | Blocking Gate |
| --- | --- | --- | --- | --- |
| Official primary domain | `jingtangai.com` — Human Owner frozen; controlled DNS and production TLS verified 2026-08-21 | JINGTANG Executive/Brand Owner | [`config/public-site.yaml`](../../config/public-site.yaml) + production DNS/TLS evidence; Search Console remains external | D3 production website accepted |
| Domain support email | `developer@jingtangai.com` — Human Owner frozen 2026-08-21; mailbox verification pending | JINGTANG Support Owner | [`config/public-site.yaml`](../../config/public-site.yaml) + mail system/OAuth consent-screen evidence | D3 production website |
| Unique English legal entity expression | `Jingtang (Shanghai) Intelligent Technology Co., Ltd.` — Human Owner frozen 2026-08-21 | JINGTANG Legal Owner | [`config/public-site.yaml`](../../config/public-site.yaml); use verbatim on every production identity surface | D3 production website |
| DNS and Search Console ownership | Google public resolvers return the Human-controlled Tencent production host; HTTPS certificate is valid; Human Owner completed Search Console domain ownership on 2026-08-21 | JINGTANG Infrastructure Owner | GoDaddy registrar, production DNS/TLS, and protected Search Console evidence | D3 accepted; domain ownership verified |
| Production public website host | Tencent Cloud Lighthouse in Seoul; dedicated production SSH, immutable release `347f6b7`, Caddy runtime and production smoke verified 2026-08-21 | JINGTANG Infrastructure Owner | Protected host inventory plus D3 Acceptance Record | D3 production website accepted |
| Production Tencent SaaS account and Singapore resource access | Human Owner selected Tencent Cloud; the dedicated SaaS/worker resource boundary is not yet provisioned or evidenced | JINGTANG Infrastructure Owner | Protected infrastructure inventory | D7 deployment |
| Google Cloud test and production projects | Human Owner created separate `Jingtang Global Test` and `Jingtang Global Production` projects, enabled YouTube Data API v3, configured the approved two scopes, and added the protected Test user on 2026-08-21; project IDs, OAuth client secrets, and IAM details remain protected external evidence | JINGTANG YouTube Integration Owner | Protected project/IAM inventory; never repository client secrets | D5 OAuth |
| YouTube reviewer/test channel | Human Owner completed real Test OAuth and the application retrieved and displayed the authorized Channel identity on 2026-08-21; channel identifiers remain protected external evidence | JINGTANG YouTube Integration Owner | Protected reviewer inventory; never repository token or channel secret | D5 publish Human E2E |
| OAuth/YouTube support contact | Public support path is `developer@jingtangai.com`; the current Google consent-screen support selector still uses the protected project Owner Google Account until formal domain-account governance is completed | JINGTANG Support Owner | Reachable domain mailbox plus protected OAuth consent-screen evidence | D7 production verification/review |
| Production credentials and emergency access | No repository evidence | JINGTANG Security Owner | Tencent Secrets Manager references and break-glass procedure | D7 |

Before D5 begins, the Integration Owner must verify the current official policies again, prove the production/test project split, authorized-domain ownership, HTTPS redirect URIs, consent-screen identity, minimum scope list, reviewer account, quota, and audit/private-upload limitation. External approval is evidence of platform state, not a Delivery acceptance criterion.

## Design Obligation Routing

This table routes, but does not redefine, Approved Design decisions.

| Design decision | D1 derived specification | Implementation receiver |
| --- | --- | --- |
| D-01 | Content, platform-version, and per-platform field screens/states | D4 Content and Platform Version modules |
| D-02 | Separate Approve and Publish Confirmation actions | D4 approval commands; D5 publishing intent/execution |
| D-03 | Per-platform progress, partial failure, retry/recovery states | D4 intent/execution contracts; D5 worker and result UI |
| D-04 | Single Content Detail operational view | D4 detail projection and UI |
| D-05 | Channels-owned connect/reauthorize/disconnect flow | D5 channel/OAuth module; D6 revoke/delete behavior |
| D-06 | Distinct disconnect, JINGTANG deletion, and third-party deletion confirmations | D5 channel state; D6 deletion orchestration |
| D-07 | Full SaaS IA and role-sensitive states | D2 shell/RBAC, D4 content/approvals, D5 channels/activity |
| D-08 | Four-step Composer and all validation states | D4 composer implementation |
| D-09 | Identity, Workspace onboarding, invitation, and team-management screens | D2 identity/Workspace/RBAC |
| D-10 | Website IA including truthful Solutions | D3 website |
| D-11 | Website mobile-first and SaaS desktop-first/mobile-readable specifications | D2 SaaS shell, D3 website, D4/D5 operational screens |
| D-12 | Registration consent plus blocking consent/re-consent before YouTube API use | D2 consent record/registration; D5 OAuth/API gate |

D1 also exclusively receives full-state matrices, high-fidelity screens, Design System/tokens, reusable components, responsive rules, keyboard/focus/contrast requirements, accessible names and textual status/error semantics, English/简体中文 message slots and glossary, final copy slots, assets, annotations, and Human UI Final Approval. Baseline Revision 2 owns the bilingual requirement; D1 owns its visual/copy handoff without changing D-01～D-12. D2–D5 may implement only the approved D1 package and must route any material UX change back to design-readiness.

## Approval Record

The JINGTANG Human Owner explicitly approved D0 Architecture Revision 1 together with Security/Data Revision 1, Contract Governance Revision 1, and Integration Registry Revision 1 on 2026-08-20 in the originating Codex task with the instruction “批准并创建 checkpoint，同步远程仓库”.

This approval makes the four-document package the accepted D0 Authority. It approves the decisions and downstream constraints recorded here; it does not claim that cloud resources, product code, credentials, Developer Apps, external verification, or production state already exist.

On 2026-08-20, the JINGTANG Human Owner authorized the Baseline Revision 2 bilingual amendment with “我想确认有中英双语吗？如果没有，请加这条需求”. Architecture Revision 2 adds only the necessary i18n implementation boundary in A-13 and preserves all accepted Revision 1 decisions, external readiness states, and D0 checkpoint evidence.

On 2026-08-21, the JINGTANG Human Owner supplied and confirmed `jingtangai.com`, `developer@jingtangai.com`, and `Jingtang (Shanghai) Intelligent Technology Co., Ltd.` as the exact D3 official-domain, support-email, and English legal-entity values, and approved the D3 Legal/Data Disclosure package. Architecture Revision 3 freezes those identity inputs and routes their machine representation and approval state to `config/public-site.yaml`; it does not claim DNS ownership, mailbox verification, TLS, or production deployment evidence.

On 2026-08-21, the JINGTANG Human Owner clarified that the production server is in Tencent Cloud and completed dedicated SSH-key and firewall setup for the selected Lighthouse instance. Architecture Revision 4 makes that instance the D3 public-website target, replaces the unexecuted S3/CloudFront website route with an atomic Caddy/static-export deployment, and leaves the future SaaS/worker cloud boundary unchanged pending a separately authorized architecture decision. The Human Owner then explicitly approved the amended bilingual Legal/Data Disclosure covering Tencent Cloud Seoul, GoDaddy DNS, Let's Encrypt ACME, and the restricted public-website data boundary, and authorized the production-candidate commit and rollout.

On 2026-08-21, production release `347f6b7` was deployed and verified at `https://jingtangai.com`; public DNS, HTTP-to-HTTPS redirect, Let's Encrypt certificate, required bilingual routes, legal surfaces, registry truth, security headers, container runtime, and Production Human E2E passed. The Human Owner approved D3 Stage Acceptance and authorized its checkpoint. Search Console and later OAuth/YouTube verification remain separate external readiness items and are not implied by D3 acceptance.

On 2026-08-21, before D5 implementation, the Human Owner explicitly approved replacing the unimplemented AWS SaaS target with Tencent Cloud and chose not to provision a separate test server. Architecture Revision 5 therefore moves the planned SaaS identity, compute, database, object storage, queue, secret, key, and observability boundaries to Tencent Cloud while requiring a logically isolated integration stack and separate Google Cloud Test project. It does not claim that the dedicated Tencent SaaS resources, CIAM tenant, KMS key, Secrets Manager entries, or production OAuth client have been provisioned. The already accepted D3 public-site deployment remains unchanged.

On 2026-08-22, after the first D5 acceptance re-review identified that the real OAuth/private-upload proof ran in the protected local harness while Tencent TDMQ resources were still unprovisioned, the Human Owner authorized the recommended minimum correction. Architecture Revision 6 records the local D5 outbox adapter as test-only evidence and keeps dispatcher → TDMQ → worker as a blocking D7 deployed-environment obligation. This clarification does not change the Baseline product target, weaken production isolation, or recast local evidence as production/reviewer evidence.
