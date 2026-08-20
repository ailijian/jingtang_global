# JINGTANG Current Architecture Authority

- Status: Approved
- Architecture Revision: 1
- Effective Date: 2026-08-20
- Delivery: JINGTANG 海外官网与 SaaS 第一版上线
- Baseline: [`docs/deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md`](deliveries/jingtang-overseas-website-saas-v1-launch/BASELINE.md), Approved Revision 1
- Design input: [`docs/JINGTANG V1 UX Architecture & Design Authority v0.1.md`](JINGTANG%20V1%20UX%20Architecture%20%26%20Design%20Authority%20v0.1.md), Approved Revision 1
- Owner: JINGTANG Architecture Owner
- Approval owner: JINGTANG Human Owner

## Authority Boundary

This document owns the current implementation architecture: system and module boundaries, technology and deployment choices, environment and regional topology, identity and tenant boundaries, persistence and asynchronous execution, secrets and observability boundaries, and the location of machine contract, migration, verification, and CI owners.

It does not own or restate Delivery goals, scope, product acceptance criteria, material UX meaning, legal copy, public capability claims, retention policy, or individual contract payloads. Those remain owned by the Approved Baseline, Approved Design Authority, [`docs/SECURITY_AND_DATA.md`](SECURITY_AND_DATA.md), [`contracts/`](../contracts/), and [`config/integrations.yaml`](../config/integrations.yaml), respectively.

The decisions below are build constraints after Human Owner approval. Exact dependency patch versions and non-material library substitutions are implementation details and must be locked and verified in D2.

## Architecture Decisions

| ID | Decision | Consequence |
| --- | --- | --- |
| A-01 | Use a TypeScript monorepo on the current Active LTS Node.js line, with `pnpm` workspaces. | Website, SaaS, worker, contracts, and infrastructure share types and tooling without becoming one deployable. |
| A-02 | Use a modular monolith with three deployables: a public Next.js website, a Next.js SaaS/BFF, and a Node.js asynchronous worker. | D3 can launch the website independently; domain rules stay in modules; external platform work never runs in a browser request. |
| A-03 | Use PostgreSQL as the transactional system of record, Amazon S3 for private source assets, a transactional outbox plus Amazon SQS for asynchronous work, and Amazon SES for transactional email. | Workspace, approval, intent, execution, and audit writes can commit atomically; large media does not pass through application memory. |
| A-04 | Use Amazon Cognito User Pools for sign-up, login, logout, password reset, and credential policy. Use server-managed secure sessions in the SaaS; keep Workspace membership and roles in PostgreSQL. | JINGTANG does not store passwords; application authorization remains tenant-aware and independent of the identity provider. |
| A-05 | Deploy production application data and compute in AWS `ap-southeast-1` (Singapore). Keep non-production and production in separate AWS accounts and separate Google Cloud projects. | The primary storage region is explicit; credentials, logs, queues, databases, and buckets cannot be shared across environments. |
| A-06 | Use AWS CDK in TypeScript for infrastructure as code and GitHub Actions for blocking CI. Production deployment requires a protected GitHub Environment and a human approver. | Infrastructure changes are reviewable; CI identity uses short-lived OIDC credentials rather than stored AWS access keys. |
| A-07 | Expose versioned REST/JSON under `/api/v1`. JSON Schema 2020-12 owns payload shapes; OpenAPI 3.1 owns HTTP operations; AsyncAPI 3.x owns asynchronous channel bindings. | Contracts can be validated independently of runtime code and referenced by reviewer evidence. |
| A-08 | Use Prisma as the PostgreSQL schema and migration owner. Every table carrying tenant data has a non-null `workspace_id`; PostgreSQL row-level security (RLS) and application authorization are both required. | Tenant isolation has two enforceable layers. Migrations use expand/migrate/contract sequencing. |
| A-09 | Represent workflow lifecycle, publishing intent, and each platform execution separately. An explicit confirmation creates one immutable intent snapshot and one execution per selected account. | Approval is not publish, partial failure stays visible, and retries are scoped to an execution rather than the whole Content. |
| A-10 | Store production secrets in AWS Secrets Manager. Envelope-encrypt OAuth tokens per connection with AWS KMS; tokens and platform secrets are server/worker-only. | A connection can be cryptographically erased, and tokens cannot be serialized into browser responses, ordinary logs, analytics, or error payloads. |
| A-11 | Use structured JSON logs, OpenTelemetry-compatible traces, CloudWatch metrics/alarms, and a separate append-only audit-event store. | Technical telemetry and user-visible audit history have different schemas and retention; correlation is by opaque IDs. |
| A-12 | YouTube is the first production integration slice. No other platform adapter or permission is built in this Delivery. Schedule remains disabled until a later verified capability decision. | The build stays aligned with the PLAN and truthful public status registry. |

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
└── ui/                   D1-derived components and tokens

contracts/                machine-readable payload/API/event authority
config/integrations.yaml  public and product integration capability truth
infra/                    AWS CDK stacks by environment
```

Dependencies point inward: deployables may depend on application/domain packages; domain packages do not import UI, AWS, Cognito, Prisma, SQS, or YouTube SDKs. Platform adapters implement interfaces defined at the application boundary. Cross-module writes go through application use cases, not direct table access.

## Runtime and Deployment Topology

### Public website

- Next.js static output is stored in a private S3 bucket and served through CloudFront with TLS and security headers.
- Only public website assets may be cached at global edge locations. Authenticated SaaS pages, user content, OAuth responses, and API data are excluded.
- The website has an independent deployment pipeline so D3 does not expose an incomplete SaaS.

### SaaS and worker

- The SaaS/BFF and worker run as separate ECS Fargate services in private subnets in `ap-southeast-1`.
- An Application Load Balancer terminates public SaaS HTTPS traffic. The database, queues, buckets, Secrets Manager, and KMS are not public.
- RDS PostgreSQL is Multi-AZ. S3 buckets use Block Public Access, versioning, KMS encryption, and lifecycle rules.
- SQS queues have a dead-letter queue. The worker uses bounded retry with jitter and idempotency keys; it does not infer user consent from a retry.

### Environments

| Environment | Isolation | External platform rule |
| --- | --- | --- |
| local/test | Local or ephemeral test resources; synthetic data only | No production credentials or real publish |
| staging | Non-production AWS account and Google Cloud test project | Allow-listed test users/channels; capability never marked Available |
| production | Dedicated AWS account and Google Cloud production project | Verified domains, protected deploy, least privilege, production audit |

No database, bucket, KMS key, queue, OAuth client, redirect URI, secret, or log destination is shared between staging and production.

## Identity, Tenant, and RBAC Boundary

1. Cognito authenticates a human and returns an immutable external subject identifier.
2. The BFF maps that subject to an internal `user_id`; no tenant is accepted from an unsigned browser claim.
3. Each request selects a Workspace from server-side membership and establishes `workspace_id`, `user_id`, and permission context for the transaction.
4. The application permission check is deny-by-default. PostgreSQL RLS then restricts tenant rows using the transaction-local Workspace context.
5. Background jobs carry immutable `workspace_id`, actor/intent identifiers, and an idempotency key. The worker re-authorizes the stored intent and channel state before any external write.
6. Owner/Admin is the administrative super-role and may perform all V1 actions, but approval and external publish still require separate explicit commands. Editor, Approver/Publisher, and Viewer permissions follow the matrix owned by `contracts/README.md`.

Global cross-tenant application queries are prohibited. Operational support access uses a time-bound production role, reason/ticket reference, and audit record; it does not bypass database policy through shared application credentials.

## Persistence and Migration Ownership

- PostgreSQL owns durable business state. S3 owns immutable asset objects; the database owns object metadata and lifecycle state.
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

The dispatcher publishes outbox messages to SQS. The worker claims one execution, rechecks revocation/deletion state, performs the adapter call with an idempotency key, and records the platform ID/URL and real result. `publishing`, `processing`, `published`, `failed`, `needs_attention`, and `cancelled` are per-execution outcomes. No aggregate status may overwrite them.

Disconnect or deletion writes a deny marker before asynchronous cleanup starts. Workers must reject new or queued calls for denied connections. Token revocation and deletion behavior is owned by `docs/SECURITY_AND_DATA.md`; UI meaning remains owned by the Design Authority.

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
| Official primary domain | Not yet frozen | JINGTANG Executive/Brand Owner | DNS registrar + approval recorded here as a future revision | D3 production website |
| Domain support email | Not yet frozen | JINGTANG Support Owner | Mail system verification + OAuth consent screen | D3 production website |
| Unique English legal entity expression | Chinese legal entity is fixed by Baseline; English expression is not yet legally verified | JINGTANG Legal Owner | Legal approval recorded here and copied verbatim to production configuration | D3 production website |
| DNS and Search Console ownership | No repository evidence | JINGTANG Infrastructure Owner | Registrar, Route 53, and Search Console ownership evidence | D3 and Google verification |
| Production AWS account and Singapore region access | Not provisioned by D0 | JINGTANG Infrastructure Owner | Protected infrastructure inventory | D3/D7 deployment |
| Google Cloud test and production projects | No repository evidence | JINGTANG YouTube Integration Owner | Project IDs and IAM owner list in protected inventory; never client secrets | D5 OAuth |
| YouTube reviewer/test channel | No repository evidence | JINGTANG YouTube Integration Owner | Protected reviewer inventory | D5 Human E2E |
| OAuth/YouTube support contact | No repository evidence | JINGTANG Support Owner | Reachable domain email in OAuth project and public pages | D5 OAuth |
| Production credentials and emergency access | No repository evidence | JINGTANG Security Owner | Secrets Manager references and break-glass procedure | D5/D7 |

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

D1 also exclusively receives full-state matrices, high-fidelity screens, Design System/tokens, reusable components, responsive rules, keyboard/focus/contrast requirements, accessible names and textual status/error semantics, final copy slots, assets, annotations, and Human UI Final Approval. D2–D5 may implement only the approved D1 package and must route any material UX change back to design-readiness.

## Approval Record

The JINGTANG Human Owner explicitly approved D0 Architecture Revision 1 together with Security/Data Revision 1, Contract Governance Revision 1, and Integration Registry Revision 1 on 2026-08-20 in the originating Codex task with the instruction “批准并创建 checkpoint，同步远程仓库”.

This approval makes the four-document package the accepted D0 Authority. It approves the decisions and downstream constraints recorded here; it does not claim that cloud resources, product code, credentials, Developer Apps, external verification, or production state already exist.
