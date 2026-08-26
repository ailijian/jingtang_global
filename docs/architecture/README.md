# JINGTANG Current Architecture Authority

- Status: Approved
- Architecture Revision: 13
- Effective Date: 2026-08-25
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
| A-05 | Deploy production SaaS application data and compute in Tencent Cloud Seoul (`ap-seoul`). The D3 public website and the D7 SaaS data plane remain separate resource boundaries even though both are in Seoul. A deployed integration stack, when present, remains logically isolated even when it shares a Human-controlled Tencent compute host. Before those resources exist, D5 may use the protected local test harness with the Google Cloud Test project and Human-owned test media solely to prove the real OAuth/API slice; that harness is not a production, reviewer, or deployed integration environment. | Production and any deployed integration stack use separate databases, buckets, queues, keys, sealed-secret objects, logs, OAuth clients, configuration namespaces, and network exposure. The D5 local exception never authorizes production credentials, public capability rollout, or substitution for D7 production evidence. |
| A-06 | Use Terraform with the Tencent Cloud provider for SaaS infrastructure as code and GitHub Actions for blocking CI. Production deployment requires a protected GitHub Environment and a human approver; cloud access uses short-lived federation rather than stored general-purpose keys where the selected Tencent service supports it. | Infrastructure changes are reviewable; the design does not depend on an AWS account or AWS CDK. |
| A-07 | Expose versioned REST/JSON under `/api/v1`. JSON Schema 2020-12 owns payload shapes; OpenAPI 3.1 owns HTTP operations; AsyncAPI 3.x owns asynchronous channel bindings. | Contracts can be validated independently of runtime code and referenced by reviewer evidence. |
| A-08 | Use Prisma as the PostgreSQL schema and migration owner. Every table carrying tenant data has a non-null `workspace_id`; PostgreSQL row-level security (RLS) and application authorization are both required. | Tenant isolation has two enforceable layers. Migrations use expand/migrate/contract sequencing. |
| A-09 | Represent workflow lifecycle, publishing intent, and each platform execution separately. An explicit confirmation creates one immutable intent snapshot and one execution per selected account. | Approval is not publish, partial failure stays visible, and retries are scoped to an execution rather than the whole Content. |
| A-10 | Store production runtime secrets as application-level KMS-sealed bundles in a dedicated private COS secret bucket in Seoul. Only a protected operator may write a new immutable bundle version; the runtime CVM role may read the named objects and invoke only the dedicated KMS decrypt key. Envelope-encrypt production OAuth tokens per connection with a separate Tencent Cloud KMS key; tokens and platform secrets are server/worker-only. Tencent Cloud International Secrets Manager is not used because its current API region list does not include `ap-seoul`. Local envelope encryption is permitted in local/test and, under A-16 only, in the time-bounded non-production review profile; staging and production reject it. | Seoul residency is preserved without active plaintext secrets in Terraform, images, Git, ordinary environment artifacts, or logs. The review exception uses one root-only local key plus independently destructible per-connection keys in a protected host store that is not backed up; host loss requires channel reconnection. Provider-required TencentDB/TDMQ bootstrap passwords remain one-use sensitive inputs confined to encrypted/private Terraform state and are invalidated immediately after provisioning. Secret-bundle rotation is versioned and auditable, OAuth authorization can still be cryptographically erased independently, and any later move to a managed secret service requires verified Seoul availability plus an explicit architecture revision. |
| A-11 | Use structured JSON logs, OpenTelemetry-compatible traces, Tencent Cloud CLS and Cloud Monitor metrics/alarms, and a separate append-only audit-event store. | Technical telemetry and user-visible audit history have different schemas and retention; correlation is by opaque IDs. |
| A-12 | YouTube is the first production integration slice. No other platform adapter or permission is built in this Delivery. Schedule remains disabled until a later verified capability decision. | The build stays aligned with the PLAN and truthful public status registry. |
| A-13 | Treat `en` and `zh-CN` as first-class application locales, with English as the safe default. Use one versioned message-catalog package across the website, SaaS and server-generated user messages; persist an authenticated user locale preference and keep public website locale routes stable. Machine status/permission values remain language-neutral, and user-authored content is never translated by locale switching. | Translation cannot fork domain meaning or capability truth; SSR and client hydration resolve the same locale; the UI can switch languages without recreating Workspace, draft, task or external-write state. |
| A-14 | Host the D3 static public website on the Human-controlled Tencent Cloud Lighthouse production instance in Seoul. Serve the immutable Next.js export through a pinned Caddy container, obtain and renew the `jingtangai.com` certificate through ACME, keep DNS at the Human-controlled registrar, and deploy atomically over dedicated SSH access. | The public website remains independently deployable and has no application database or secret. A-03～A-06 and A-10 continue to govern the not-yet-production SaaS/worker boundary; this D3 amendment does not silently migrate those future data services. |
| A-15 | Model disconnect, Workspace deletion, account deletion, Authorized Data expiry, retention purge, and OAuth envelope-key retirement as one durable lifecycle control plane. BFF routes only commit deny/request state. A separately credentialed worker claims operations using database time, an expiring owner lease, monotonically increasing generation, and durable step journal; every effect is fenced by the active generation. Token replacement or live-record erasure transactionally records the old key reference before the worker destroys it idempotently. Authorized Data refresh leases and fences the same channel generation used by disconnect and publishing. Publishing uses an independent outbox claim generation and per-channel operation generation, while a claimed dead-letter can conservatively terminalize an execution even when work-item reconstruction fails. The app role cannot claim lifecycle work or invoke cleanup/pseudonymization functions. Account-deletion request and completion serialize on the same Workspace ownership lock; only active users count as eligible successor Owner/Admins. Workspace deletion status is authorized by an immutable requester-specific pseudonymous reference, never by mutable Workspace history. Workspace audit remains tenant-bound; login/logout/locale/account-deletion facts use a separate minimized global append-only account ledger and are never fanned into a Workspace. | Crashes and stale workers cannot complete or mutate a newer claim; a committed token rotation cannot strand an undeletable old backup key; refresh cannot erase a token needed by concurrent disconnect; provider work cannot start after deny; queue completion cannot resurrect cancelled work; concurrent role changes cannot strand a Workspace or let a pending-deletion account satisfy its ownership invariant; SLA expiry escalates but never abandons compliance cleanup; account facts do not create cross-tenant audit ownership. |
| A-16 | Permit one time-bounded, non-production `review` profile on the existing Seoul Lighthouse for current product demonstrations and Facebook/TikTok developer-review enablement. It uses `review.jingtangai.com`, isolated containers/network/volumes, a dedicated local PostgreSQL database, one direct-outbox worker, private review COS/CAM resources, a root-only local `local:v2` envelope-key boundary, separate OAuth clients and pre-created identities. `review` remains an internal deployment classification: the official website may link to its real login and the SaaS presents the formal product without an environment banner, while public registration, public promotion, production namespaces and in-place promotion remain prohibited. | This is an explicit physical-co-location, direct-outbox and local-envelope-key exception to A-10/A-14 and the deployed-integration TDMQ rule, not D7 final-production evidence. Staging/production KMS requirements remain unchanged. Before teardown, the official sign-in target must be migrated or accurately disabled; teardown then revokes credentials, destroys the local root/key store and removes review data while preserving only minimized lifecycle evidence. |
| A-17 | Treat the company Business Portfolio-owned Meta App ID as a durable external integration identity rather than a Review-host runtime secret. The same App ID may survive later infrastructure migration so R3 evidence is not deliberately discarded, but Review user/Page tokens, authorization rows, App Secret material, redirect/callback URLs, database state, logs and runtime configuration remain environment-bound. | This is the only approved exception to A-05/A-16's separate OAuth-client rule. Before final-production cutover, revoke Review grants, destroy per-connection keys, rotate the App Secret, remove Review URLs and rerun security, policy and external-readiness checks. Continued Advanced Access or App Review approval is never inferred, and the Seoul Review runtime still cannot be promoted in place. |

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

- The SaaS/BFF and worker run as separate containers on a dedicated Human-controlled Tencent Cloud compute host in Seoul; this is a separate resource boundary from the D3 Lighthouse website host. Moving those workloads to TKE later is an operational change that must preserve the same boundaries.
- The BFF and worker use distinct non-superuser TencentDB roles and secret references. The BFF role can persist tenant-bound requests; the worker role alone can claim lifecycle/outbox work and execute the narrowly granted cleanup functions.
- Tencent Cloud Load Balancer or a dedicated Caddy ingress terminates public SaaS HTTPS traffic. TencentDB for PostgreSQL, TDMQ, COS secret/data buckets, and KMS are not public.
- TencentDB for PostgreSQL uses the selected production high-availability and backup controls. COS buckets deny public access, use versioning, KMS encryption, and lifecycle rules.
- TDMQ queues use a dead-letter queue. The worker uses bounded retry with jitter and idempotency keys; it does not infer user consent from a retry.

### Environments

| Environment | Isolation | External platform rule |
| --- | --- | --- |
| local/test | Local or ephemeral application resources; synthetic fixtures by default. D5 additionally permits protected Human-owned test media and an allow-listed account only for the recorded real Google Test-project OAuth/private-upload proof. | Allow-listed test users/channels; qualifying uploads remain private; no production credential; no Available claim |
| integration | Isolated container/configuration namespace using separate database, bucket, queue, key, secret and log destinations; it may share a dedicated Tencent host but never a production namespace | Google Cloud Test project only; protected access; capability never marked Available |
| review | Time-bounded isolated Docker namespace on the existing Seoul Lighthouse under A-16; dedicated local PostgreSQL, private review COS/CAM resources, root-only host-local envelope key and non-backed-up detached key store, pre-created accounts, direct-outbox worker concurrency 1, official website sign-in target, no public registration or production namespace | Formal user-facing product experience for authorized accounts; Platform Sandbox/Test/Review credentials only; `noindex`; each integration capability remains Coming Soon until separately approved and production-verified |
| production | D3 public website remains isolated on the Tencent Cloud Lighthouse host in Seoul; SaaS/worker target a separate dedicated Tencent compute and data boundary in Seoul; Google Cloud Production project is separate | Verified domains, protected deploy, least privilege, required Google verification/audit and truthful private-upload limitation |

No database, bucket, KMS key, queue, OAuth client, redirect URI, secret, or log destination is shared between local/test, integration, review, and production. A-16 permits review and the public website to share only the physical Lighthouse host and existing TLS ingress; their application data and deployment namespaces remain isolated.

### Seoul regional capability constraint

The regional target is `ap-seoul`, with `ap-seoul-1` and `ap-seoul-2` as the current identifiers in Tencent Cloud's [CVM region and zone list](https://www-sg.tencentcloud.com/document/product/213/6091?has_map=2). D7 must still query current account/SKU capacity before any production plan or apply. As of 2026-08-24, official product documentation exposes Seoul for [TencentDB for PostgreSQL](https://www.tencentcloud.com/ind/document/api/409/16776), [COS](https://www-sg.tencentcloud.com/ind/document/product/436/6224), [KMS](https://www.tencentcloud.com/pt/document/api/1030/32174), and [TDMQ RabbitMQ](https://www.tencentcloud.com/document/product/1112/64349). Tencent Cloud International Secrets Manager's documented [`ListSecrets` region list](https://www.tencentcloud.com/document/api/1078/38646) excludes Seoul, so Terraform and runtime deployment must follow A-10's KMS-sealed COS bundle design rather than silently creating a cross-region SSM dependency. This documentation check is architecture input, not production provisioning evidence.

## Identity, Tenant, and RBAC Boundary

1. Tencent Cloud CIAM authenticates a human and returns an immutable external subject identifier. The existing Cognito adapter is a transitional implementation only and cannot be selected for the Revision 5 production deployment.
2. The BFF maps that subject to an internal `user_id`; no tenant is accepted from an unsigned browser claim.
3. Each request selects a Workspace from server-side membership and establishes `workspace_id`, `user_id`, and permission context for the transaction.
4. The application permission check is deny-by-default. PostgreSQL RLS then restricts tenant rows using the transaction-local Workspace context.
5. Background jobs carry immutable `workspace_id`, actor/intent identifiers, and an idempotency key. The worker re-authorizes the stored intent and channel state before any external write.
6. Owner/Admin is the administrative super-role and may perform all V1 actions, but approval and external publish still require separate explicit commands. Editor, Approver/Publisher, and Viewer permissions follow the matrix owned by `contracts/README.md`.

Global cross-tenant product queries are prohibited. The sole account-scoped exception is a restricted append-only account audit ledger containing hashed/minimized identity lifecycle facts; it is not queryable through a Workspace Activity surface and is never assigned to a tenant. Operational support access uses a time-bound production role, reason/ticket reference, and audit record; it does not bypass database policy through shared application credentials.

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

In every deployed integration or production environment, the dispatcher publishes outbox messages to TDMQ. The worker consumes one command, claims one execution with an owner, expiry, and monotonically increasing generation, acquires the selected channel's operation-generation fence, rechecks revocation/deletion state, performs the adapter call with an idempotency key, and records the platform ID/URL and real result only while both fences remain current. `publishing`, `processing`, `published`, `failed`, `needs_attention`, and `cancelled` are per-execution outcomes. No aggregate status or stale worker may overwrite them.

The protected D5 local test harness may lease and process the PostgreSQL outbox directly in its single worker deployable. This local adapter must preserve the same immutable intent, tenant, idempotency, bounded retry and conservative ambiguous-result behavior, but it is not TDMQ evidence. D7 remains blocked until the production dispatcher → TDMQ → worker path and its dead-letter/retry behavior are implemented and verified.

Disconnect or deletion writes a deny marker and lifecycle operation before asynchronous cleanup starts. The request path never performs provider revocation or destructive completion. Workers must reject new or queued calls for denied connections, and lifecycle deadlines are observability/SLA boundaries rather than terminal retry cutoffs. Token revocation and deletion behavior is owned by `docs/security-and-data/README.md`; UI meaning remains owned by the Design Authority.

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
| Production Tencent SaaS account and Seoul resource access | Human Owner confirmed the existing Tencent production location is Seoul; the separate dedicated SaaS/worker resource boundary is not yet provisioned or evidenced | JINGTANG Infrastructure Owner | Protected `ap-seoul` infrastructure inventory and current product-capacity evidence | D7 deployment |
| Google Cloud test and production projects | Human Owner created separate `Jingtang Global Test` and `Jingtang Global Production` projects, enabled YouTube Data API v3, configured the approved two scopes, and added the protected Test user on 2026-08-21; project IDs, OAuth client secrets, and IAM details remain protected external evidence | JINGTANG YouTube Integration Owner | Protected project/IAM inventory; never repository client secrets | D5 OAuth |
| YouTube reviewer/test channel | Human Owner completed real Test OAuth and the application retrieved and displayed the authorized Channel identity on 2026-08-21; channel identifiers remain protected external evidence | JINGTANG YouTube Integration Owner | Protected reviewer inventory; never repository token or channel secret | D5 publish Human E2E |
| OAuth/YouTube support contact | Public support path is `developer@jingtangai.com`; the current Google consent-screen support selector still uses the protected project Owner Google Account until formal domain-account governance is completed | JINGTANG Support Owner | Reachable domain mailbox plus protected OAuth consent-screen evidence | D7 production verification/review |
| Production credentials and emergency access | No repository evidence | JINGTANG Security Owner | KMS-sealed COS bundle references, rotation evidence and break-glass procedure | D7 |

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

On 2026-08-21, before D5 implementation, the Human Owner explicitly approved replacing the unimplemented AWS SaaS target with Tencent Cloud and chose not to provision a separate test server. Architecture Revision 5 therefore moved the planned SaaS identity, compute, database, object storage, queue, secret, key, and observability boundaries to Tencent Cloud while requiring a logically isolated integration stack and separate Google Cloud Test project. That revision mechanically retained the earlier D0 Singapore assumption even though the Human Owner had already supplied and used a Seoul Tencent production host; Revision 9 supersedes that regional inference. No dedicated Tencent SaaS resources, CIAM tenant, KMS key, secret store, or production OAuth client were provisioned under the superseded assumption. The already accepted D3 public-site deployment remains unchanged.

On 2026-08-22, after the first D5 acceptance re-review identified that the real OAuth/private-upload proof ran in the protected local harness while Tencent TDMQ resources were still unprovisioned, the Human Owner authorized the recommended minimum correction. Architecture Revision 6 records the local D5 outbox adapter as test-only evidence and keeps dispatcher → TDMQ → worker as a blocking D7 deployed-environment obligation. This clarification does not change the Baseline product target, weaken production isolation, or recast local evidence as production/reviewer evidence.

Architecture Revision 7 records the D6 lifecycle implementation: deny-first Disconnect/Deletion states, programmatic provider revocation, scoped Authorized Data cleanup, a 30-day worker clock, and constrained audit pseudonymization. These are repository-verified controls only; D7 still owns Tencent Cloud production scheduler, KMS, monitoring, access, backup, and recovery evidence.

On 2026-08-23, after repeated D6 reviews exposed cross-cutting lifecycle races, the Human Owner approved the architecture-level closure plan and then explicitly instructed “同意你的方案，请进行收口修复”. Architecture Revision 8 replaces parallel ad-hoc lifecycle schedulers with one durable database control plane, separates app/worker database authority, adds generation fencing to lifecycle and publishing effects, serializes account deletion and ownership mutation on a shared Workspace lock with active-successor eligibility, separates global account audit from tenant Activity, and requires post-recovery-point deletion-ledger replay before reads. The product target and D7 production-evidence boundary are unchanged.

On 2026-08-24, the Human Owner clarified that the actual Tencent production location is Seoul and authorized a formal correction after review. Architecture Revision 9 supersedes the inherited Singapore assumption with `ap-seoul`, keeps the D3 website and D7 SaaS data plane as separate resource boundaries in the same region, and records current regional service constraints before any external write. Official Tencent documentation confirms the selected Seoul CVM/AZ and core PostgreSQL, COS/KMS and TDMQ paths, while the documented International Secrets Manager API region list excludes Seoul; A-10 therefore replaces SSM with a dedicated KMS-sealed private COS secret bundle. This revision changes no deployed resource, does not claim that the D7 SaaS boundary exists, and does not authorize Terraform plan/apply, deployment, DNS, Developer Console or rollout activity.

Architecture Revision 10 corrects A-10's Terraform-state claim to match the provider-required provisioning boundary. TencentDB and TDMQ bootstrap passwords are one-use sensitive resource inputs and therefore appear in Terraform state; the COS backend now forces private ACL and server-side encryption, while the operator must use a dedicated versioned least-privilege state bucket and immediately invalidate both bootstrap values before sealing active role-specific credentials. This correction performs no external write and does not weaken the prohibition on active runtime secrets in Terraform, Git, images, logs, or ordinary deployment artifacts.

On 2026-08-24, the Human Owner approved the recommended temporary developer-review deployment and authorized implementation after purchasing a 20 GB Tencent COS storage package. Architecture Revision 11 adds A-16 as a time-bounded, non-production exception for `review.jingtangai.com` on the existing Seoul Lighthouse: isolated Docker namespaces and data, dedicated local PostgreSQL, one direct-outbox worker, private review COS/KMS/CAM resources, separate OAuth clients, and pre-created reviewer identities. This approval does not amend the D7 production target, promote review resources in place, or authorize unapproved platform permissions, third-party submissions, DNS writes, credential creation, or deployment by itself.

Later on 2026-08-24, after Tencent KMS was confirmed to require a paid instance, the Human Owner explicitly approved a cost-bounded amendment: the temporary review profile uses the existing `local:v2` envelope adapter with a root-only 256-bit host key and detached per-connection key store on its protected persistent volume. Architecture Revision 12 removes review KMS and wrapped-key-COS dependencies and their CAM permissions; the detached store is excluded from backup, so loss or replacement requires channel reconnection. The separately created OAuth-key Bucket remains empty and uncredentialed until review teardown. A-10's staging/production Tencent KMS, sealed-secret, separation and evidence requirements are unchanged, and the review profile still cannot be promoted in place.

On 2026-08-26, the Human Owner approved the R3 Facebook Scope package and its durable Meta App ID exception. Architecture Revision 13 adds A-17: JINGTANG's company Business Portfolio owns the Meta App ID as a durable external identity, while every Review runtime credential, token, authorization row, URL, data and log remains isolated and is revoked, rotated or removed before final-production cutover. This avoids deliberately resetting the App identity without treating the temporary Seoul runtime as production or presuming that Meta review status transfers unchanged.

On 2026-08-25, the Human Owner explicitly approved Social Platform Review Baseline Revision 3 and superseded A-16's former public-presentation restriction. Architecture Revision 13 keeps every physical, identity, capacity, key, data and future-production boundary unchanged, but permits the official website to link to the real current SaaS login and requires the user-facing SaaS to omit internal review/test environment labels. This is current controlled product access, not public registration, promotion, D7 final-production evidence or permission to promote the Lighthouse deployment in place.
