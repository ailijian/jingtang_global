# JINGTANG Contract Governance

- Status: Approved
- Contract Governance Revision: 2
- Effective Date: 2026-08-20
- Owner: JINGTANG Contract Owner
- Architecture: [`docs/architecture/README.md`](../docs/architecture/README.md)
- Machine catalog: [`contracts/manifest.yaml`](manifest.yaml)

## Authority Boundary

This directory is the canonical owner for versioned external and cross-module payload shapes, domain vocabulary, permission identifiers, HTTP operations, asynchronous event envelopes, compatibility rules, and contract fixtures.

It does not own product requirements or UX meaning; those come from the Approved Baseline and Design Authority. It does not own the PostgreSQL schema: Prisma schema and migrations under `packages/db/` become that owner in D2. Runtime types must be generated from or checked against these contracts rather than becoming a second authority.

## Formats and Locations

| Contract kind | Canonical format/location | Rule |
| --- | --- | --- |
| Shared/domain payload | JSON Schema Draft 2020-12 under `contracts/schemas/<domain>/v<major>/` | Every schema has a stable `urn:jingtang:contract:<domain>:<name>:v<major>` `$id` and denies unknown fields unless extension is explicit |
| REST API | OpenAPI 3.1 under `contracts/http/openapi.yaml` | Operations reference canonical JSON Schemas; API is served under `/api/v1` |
| Async API | AsyncAPI 3.x under `contracts/events/asyncapi.yaml` | Messages reference canonical JSON Schemas and use the standard event envelope |
| Catalog/status | `contracts/manifest.yaml` | Lists every required contract, owner stage, canonical path, and implementation status |
| Persistence | `packages/db/prisma/schema.prisma` and timestamped migrations | Database shape is not inferred from API schemas |

Schema and API files are created by their owning execution Stage. D0 freezes their vocabulary and compatibility policy; it does not fabricate schemas for code that does not yet exist.

## Stable V1 Vocabulary

Machine values use lower `snake_case`; user-facing labels remain owned by Design.

### Locales

- Supported application locale values are `en` and `zh-CN`; `en` is the default and safe fallback.
- D2 owns a `locale_preference` contract for authenticated users. A locale change is idempotent and may not change the active Workspace, route/task identity, draft revision, publishing intent, consent decision, or external execution.
- Domain states, permissions, capability values, policy versions and audit actions remain language-neutral machine values. `packages/i18n/` maps them to the reviewed D1 message catalog; translated labels never become a second contract authority.
- User-authored Source Asset metadata, Caption, Title, Description, comments and platform fields are stored and returned as authored. Locale switching does not translate or rewrite them.

### Roles and permissions

| Role | Required permissions |
| --- | --- |
| `owner_admin` | All V1 permissions, including Workspace/member/channel administration and operational actions; approval and publish still require separate explicit commands |
| `editor` | Read Workspace/channel status; create/upload/edit Draft; create/edit platform versions; submit for approval |
| `approver_publisher` | Read Content; approve/reject with reason; explicitly confirm publish; inspect results |
| `viewer` | Read-only access to authorized Workspace Content, status, channel summaries, and Activity |

Stable permission IDs begin with: `workspace.read`, `workspace.manage`, `member.invite`, `member.remove`, `member.role.assign`, `channel.read`, `channel.connect`, `channel.reauthorize`, `channel.disconnect`, `content.read`, `content.create`, `content.edit`, `content.submit`, `content.approve`, `content.reject`, `content.publish`, `activity.read`, and `data.delete`. D2 owns the complete deny matrix and automated enforcement fixtures.

### State concepts

The Baseline-approved labels are represented without collapsing three meanings:

- Content Lifecycle: `draft`, `pending_approval`, `rejected`, `approved`.
- Publishing Intent: `none`, `ready`, `scheduled`, `cancelled`. `scheduled` is a valid contract value but no integration may create it while the registry capability is `not_available`.
- Platform Execution: `not_started`, `publishing`, `processing`, `published`, `failed`, `needs_attention`, `cancelled`.
- Channel State: `not_connected`, `connecting`, `connected`, `reauthorization_required`, `disconnecting`, `disconnected`.

`Scheduled`, `Publishing`, `Processing`, `Published`, `Failed`, `Needs Attention`, and `Cancelled` are projections from Publishing Intent or per-platform execution, not alternative Content Lifecycle rows. Aggregate projections must retain every platform result and may not report `published` while any selected execution is failed, processing, or needs attention.

## Required Contract Semantics

The manifest routes these contracts to D2 or D4. Their machine schemas must preserve the following minimum semantics.

### Workspace and RBAC

- Opaque `workspace_id`, `user_id`, membership ID, role, status, and timestamps.
- Every tenant resource and command carries or derives a single Workspace boundary.
- Permission evaluation is deny-by-default; cross-Workspace identifiers return no resource data.
- Role change, invitation, removal, and denied sensitive action emit an Audit Event.

### Consent

- `user_id`, `terms_version`, `privacy_version`, `displayed_locale`, `accepted_at`, `acceptance_method`, and the material data-purpose version. Both locales consent to the same canonical policy version.
- Check result distinguishes `current`, `missing`, and `reconsent_required`.
- Cancel never creates consent and never begins OAuth/API work.

### Content and approval

- Content owns a user-provided Source Asset and immutable revisions.
- Each selected platform/account owns an independent Platform Version with platform-specific fields and validation result.
- Submission references an exact revision. Approval/rejection references that revision, actor, time, result, and optional/required review reason as designed.

### Publishing Intent

- References exact approved Content revision, selected platform versions, specific connected account IDs, final field hash/snapshot, mode, confirming actor, permission decision, consent version, and `confirmed_at`.
- One confirmation produces an immutable intent and one Platform Execution per selected account.
- Idempotency key prevents duplicated user confirmation from producing duplicated external writes.

### Platform Execution

- Identifies Workspace, intent, platform, channel/account, adapter operation, attempt, idempotency key, state, safe failure category, provider ID/URL when available, and timestamps.
- Retry never changes the approved payload or selected account. A changed payload requires a new revision, approval, and confirmation.
- Provider-specific raw errors are not public contract fields.

### Channel

- Stores platform/account identity, granted scope set, capability snapshot, channel state, consent reference, token-ciphertext reference, authorization/refresh timestamps, and deny/deletion markers.
- Tokens, authorization codes, client secrets, and signed URLs are forbidden from every public/API/event schema.

### Audit Event

- Required envelope: `event_id`, `event_version`, `occurred_at`, `recorded_at`, `workspace_id`, `actor`, `action`, `target`, `result`, `correlation_id`, and allow-listed `metadata`.
- Events are append-only. Corrections are new events that reference the superseded event.
- Email, token, raw content body, source media, provider credential, and raw provider error are prohibited metadata.

## Compatibility and Versioning

1. Published contracts are immutable within a released artifact. Changes create a reviewed new schema file and compatibility fixture.
2. Adding an optional property with a safe default is backward-compatible. Adding a required property, removing/renaming a property, changing type/meaning, narrowing validation, or changing an identifier is breaking.
3. Enum additions are treated as breaking unless every registered consumer fixture proves unknown-value tolerance.
4. Breaking API changes require a new major path/contract ID and a documented coexistence/deprecation window. V1 consumers are not silently migrated.
5. Async consumers must be idempotent and accept duplicate delivery. Event envelope version and payload schema version are independent.
6. The producer validates before persistence/publication; consumers validate at their trust boundary. Invalid messages go to quarantine/dead letter without provider calls.
7. Generated TypeScript types and OpenAPI reference output are build artifacts. CI fails if generation changes the working tree or if runtime types drift.

## Migration Rules

- Contract compatibility and persistence migration are separate checks and both block CI.
- Database changes use expand → backfill → switch → contract. A migration cannot require old and new application versions to interpret the same column differently.
- Every tenant table has `workspace_id`, indexed tenant access paths, RLS enablement, and positive/negative isolation fixtures.
- Forward migration runs against an empty database and a previous-release fixture. Application rollback is tested against the expanded schema.
- Destructive migration requires retention/deletion review and a verified backup restore exercise; it is never used to hide a failed deploy.

## Stage Ownership

- D2 creates Workspace, RBAC, Locale Preference, Consent, Channel base, Audit Event, HTTP shell, migration, and compatibility schemas/fixtures.
- D4 creates Source Asset, Content Lifecycle, Platform Version, Approval, Publishing Intent, and Platform Execution schemas/fixtures.
- D5 may add YouTube adapter-private schemas, but public/domain contracts remain platform-neutral and the scope/capability registry remains in `config/integrations.yaml`.
- D6 validates deletion/audit events and retention evidence; D7 freezes reviewer-facing generated references.

## Revision Record

- Revision 2 — 2026-08-20：随 Human Owner 授权的 Baseline Revision 2 增加 `en`/`zh-CN` locale vocabulary、Locale Preference contract 路由与 Consent displayed locale；Revision 1 的 domain 状态、权限、兼容性和 Stage ownership 保持不变。
