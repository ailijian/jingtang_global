# JINGTANG Operations Authority

- Status: Approved operating procedure; production evidence pending D7
- Operations Revision: 14
- Effective Date: 2026-08-24
- Owner: JINGTANG Operations Owner
- Architecture dependency: [`docs/architecture/README.md`](architecture/README.md)
- Security/Data dependency: [`docs/security-and-data/README.md`](security-and-data/README.md)

## Boundary

This document owns the repeatable operating procedures for the SaaS/BFF, worker, PostgreSQL, object storage, OAuth lifecycle, monitoring, backup/restore, incident response, vulnerability management, and production access. Architecture owns topology; Security/Data owns policy and retention; code and infrastructure configuration own implemented mechanics. D7 must attach protected Tencent Cloud production evidence before any control below is described publicly as production-verified.

## Environment and Change Control

Local/test, integration, and production use separate database, object-storage bucket, queue, KMS key, secret namespace, OAuth client, redirect URI, and log destination. Production deploys require a reviewed immutable commit, successful blocking CI, a protected deployment environment, and explicit Human Owner authorization. Database changes deploy forward before compatible application code; destructive rollback is prohibited. Application rollback keeps the expanded schema or restores into a new isolated database.

Production access is deny-by-default. Operator access requires MFA, a named person, least-privilege role, reason/ticket reference, start/expiry time, and a protected access record. Break-glass access requires a Security Owner and a second approver; credentials rotate immediately afterward. No token value, user content, or production secret enters a ticket, repository, screenshot, or ordinary log.

### D7 database and release sequence

1. Obtain the approved Git SHA, blocking CI result, Production Change Authorization reference, current Seoul capacity/zone evidence, and an operator access window. A Terraform plan is reviewed separately from apply; saved plan files are protected and never committed. Initialize the dedicated versioned COS remote-state bucket with the repository-enforced server-side encryption and private ACL, least-privilege state access, logging, and the approved retention policy. TencentDB/TDMQ one-use bootstrap passwords are sensitive Terraform-state inputs: never save an unprotected plan, invalidate both values immediately after provisioning, and keep only the encrypted/private historical state needed for infrastructure control.
2. On initial database creation, use the temporary administrator connection only from the protected operator session to create the non-superuser `jingtang_app` and `jingtang_worker` login roles. Run `pnpm db:migrate` forward with `DATABASE_ADMIN_URL`, verify migration status/RLS/grants, then remove the administrator value from the process. Never place that URL in a runtime bundle or deployment file.
3. Rotate the application, worker, and TDMQ credentials. Publish separate allow-listed `platform`, `dispatcher`, and `worker` KMS-sealed bundles through stdin with `pnpm secrets:publish:tencent`; the CIAM browser OAuth client secret belongs only to the platform bundle, while the worker uses CAM-authorized CIAM deletion without that secret. Record only the returned COS version IDs and bundle IDs in the protected change record.
4. Put the three exact COS version IDs and non-secret resource identifiers in `/srv/jingtang/saas/runtime.env` with mode `0600`. The file must contain no database URL, queue URL, client secret, session/state secret, or Tencent account key.
5. After the approved public Legal/Data revision is deployed and its production release check passes, invoke the protected `production-saas` workflow. It reruns canonical verification, builds amd64 application and minimal Caddy ingress images labelled with the exact Git SHA, blocks on High/Critical vulnerability findings in each, transfers both archives plus Compose/Caddy/activation files into the same immutable release directory, verifies both checksums and image labels, validates Compose and Caddy before replacing live files, starts the release, and requires the platform readiness endpoint to prove both database connectivity and the D7 queue schema before accepting activation.
6. Run the protected production smoke and tenant/RBAC/worker/storage/queue checks. A failed activation stops the candidate and restores the prior Compose, Caddy, release environment, and Git-SHA image together; a failed first activation is stopped without leaving a partial service. Roll back application containers only if the forward schema remains compatible; never roll a database migration backward in place.

### Runtime secret rotation and rollback

1. Open an authorized rotation record listing the affected role, reason, operator, approver, and prior COS version ID. Prepare the smallest role-allow-listed JSON payload without placing it in shell arguments, a file artifact, ticket, or log.
2. Publish the payload through stdin. The publisher requires both `JINGTANG_PRODUCTION_CHANGE_AUTHORIZED=true` and the approved change reference, creates a new KMS data key, writes an authenticated encrypted envelope, and returns only safe version identifiers.
3. Replace only the affected role's version ID in the protected host bootstrap, recreate that service, and verify startup, database/queue/KMS access, provider behavior, redacted logs, and alerts. Do not rotate all roles together unless the same credential actually crosses their boundaries.
4. If validation fails, restore the previous exact version ID and recreate the affected service. Because bundles are immutable and selected by version ID, rollback never republishes plaintext or guesses at the latest object.
5. After the new version is stable, revoke/expire the superseded upstream credential where applicable. Retain encrypted object versions only within the approved recovery window and record completion without copying the secret value.

## Runtime Controls and Monitoring

- Ingress permits TLS 1.2 or newer and redirects HTTP to HTTPS. Internal database, queue, object storage, KMS, and secret endpoints are private.
- PostgreSQL and object storage use Tencent-managed encryption. Private COS uploads inherit the Terraform-managed KMS bucket default rather than overriding it with object-level AES256. Production OAuth tokens additionally use per-connection Tencent KMS envelope encryption; each wrapped data key is addressed and destroyed by its exact COS object version so versioning cannot turn a disconnect into a recoverable delete marker. The local envelope adapter is test-only.
- The SaaS/BFF and worker use distinct non-superuser PostgreSQL roles. The app role may persist lifecycle requests but cannot claim them or execute cleanup/pseudonymization functions; only the worker role may claim fenced operations and run lifecycle effects.
- Secrets are read at runtime from immutable, application-level KMS-sealed bundle objects in the dedicated private Seoul COS secret bucket. A protected operator publishes a new version, the runtime CVM role can read only the named objects and invoke only the dedicated decrypt key, and rollback selects a prior encrypted version without putting active plaintext secrets in Terraform, images, Git, logs, or ordinary deployment artifacts. The only Terraform exception is the provider-required one-use TencentDB/TDMQ bootstrap input, confined to encrypted/private state and invalidated immediately after creation. Repository and CI secret scans are blocking.
- Structured logs use allow-listed identifiers and safe failure categories. Authorization headers, cookies, OAuth codes/tokens, signed URLs, email addresses, raw assets, and final content text are prohibited. The ingress explicitly excludes the YouTube OAuth callback path from access logging so its authorization code and state query cannot enter ordinary logs.
- Alerts cover repeated authentication/authorization denial, RLS failure, OAuth revocation failure, deletion SLA risk, Authorized Data refresh deletion, worker dead letters, backup/restore failure, unusual secret access, high error rate, and certificate expiry.

Each alert record includes severity, environment, service, correlation/reference ID, first/last observation, accountable responder, acknowledgment time, and resolution. Integration alerts route to the engineering owner. Production P1/P2 alerts route to both Operations and Security owners. D7 must prove the actual Tencent CLS/Cloud Monitor routing and paging path.

## Disconnect, Deletion, and Retention Runbooks

### YouTube disconnect

1. Verify the requester has `channel.disconnect` in the selected Workspace.
2. Write the disconnecting/deny state and cancel unstarted provider work in one tenant transaction. If a crash-bounded channel operation lease is active, expose `disconnecting` and defer revocation until that already-started operation releases or its lease expires; never issue a new lease after deny.
3. Call Google's revocation endpoint with the stored refresh token only after no active operation lease remains.
4. On success, erase the token envelope, channel Authorized Data, provider identifiers/URLs, and sensitive audit metadata; retain only minimized audit facts.
5. On failure, keep access denied, record a safe failure category, emit a structured warning for D7 alert routing, and retry with a bounded interval from the lifecycle worker. Never restore the old connection automatically. If provider revocation remains unavailable at the seven-day deadline, erase JINGTANG-held token and Authorized Data, record `local_cleanup_deadline`, keep the connection disconnected, and escalate the unresolved provider outcome without retaining the token beyond the policy window.

### Workspace data deletion

1. Require an Owner/Admin, the destructive confirmation phrase, and the exact Workspace name.
2. Record a deletion reference, deny platform work, cancel queued work, and require all already-started channel operation leases to finish or expire before revoking connected authorizations and removing live objects.
3. Delete Workspace content and connection data; remove memberships/session selection; pseudonymize the retained 365-day audit/deletion evidence.
4. Return the deletion reference outside the deleted Workspace. Third-party-held YouTube content is never implied to be deleted.
5. Before the seven-day deadline, a failed step leaves the Workspace in `deletion_pending`, keeps every ordinary product and publishing surface denied, returns the durable reference outside the Workspace, and lets the lifecycle worker retry each idempotent revoke/object/database step. At the deadline, local database records, memberships, sessions, OAuth tokens, and Authorized Data are deleted even if COS is temporarily unavailable; the deletion ledger retains only the outstanding opaque object keys, the Workspace remains deleted/denied, an operator alert is raised, and the worker continues object deletion until the ledger can be completed. Partial destructive work never reactivates the Workspace.

### Scheduled Authorized Data control

The BFF only writes a deny/request record. One durable lifecycle control loop claims disconnect, Workspace deletion, account deletion, Authorized Data retention, retention-purge, and OAuth envelope-key retirement operations by database time using a worker identity, expiring lease, monotonically increasing claim generation, and durable step journal. Every effect verifies the current claim generation; a stale worker cannot complete or mutate an operation. Token replacement and live token deletion atomically enqueue the old key reference for idempotent retirement, so an application or worker crash cannot leave backup ciphertext permanently decryptable. A parent retention operation remains incomplete, and its deletion-success audit remains unwritten, until all channel key-retirement children complete; after the retention deadline, the parent retry is scheduled behind an immediately due key-retirement child so the dependency cannot be starved. D5 `local:v1` test envelopes have no independently destructible key reference; the D6 forward migration therefore clears those legacy authorizations and requires reconnection instead of preserving a falsely erasable credential. Publishing remains a separately supervised loop with its own outbox and per-channel generation fences, so a lifecycle polling failure cannot stop publishing and vice versa. Google and COS calls have explicit request deadlines, and a failed iteration is logged with a safe category before bounded-backoff retry. The operation deadline is normally an SLA and alert boundary, never authority to abandon compliance work: overdue revocation, deletion, pseudonymization, and purge operations remain retryable until cleanup completes. Authorized Data is the bounded exception required by its 30-day maximum: the worker starts an exact-channel refresh one day before expiry, retries transient failures only before that expiry, and gives a successful refresh a new 30-day deadline. An unrecoverable failure at any time, or any refresh failure at the expiry boundary, erases the local authorization material and marks `reauthorization_required`; cleanup failures themselves remain retryable until complete. Superseded expiry operations complete as skipped rather than retrying forever. The controllable-clock and concurrency integration tests are the blocking machine proof; operators alert on overdue operations and repeated failures.

### Account deletion

1. Require the authenticated user to enter the exact account email and explicitly confirm account deletion.
2. Reject the request while any active Workspace would lose its last eligible Owner/Admin. Only memberships whose user lifecycle is `active` count as eligible; `deletion_pending` accounts never satisfy the successor requirement. The request path and worker completion path serialize on the same Workspace ownership lock and recheck the invariant before changing account lifecycle or deleting the identity.
3. On acceptance, disable all local sessions and persist one global account lifecycle operation and append-only account audit event; do not fan account events into a tenant Activity feed.
4. Before deleting the identity, the worker starts the normal durable disconnect flow for every platform channel authorized by that user, including channels in shared Workspaces. It waits for provider revocation and local OAuth/Authorized Data cleanup; shared first-party Workspace content remains available and another active member must reconnect the channel to continue publishing. A Workspace already being deleted owns its channel cleanup, and the account operation waits for that cleanup instead of creating a competing path.
5. The worker then deletes the CIAM identity, removes memberships and pending identity data, pseudonymizes the local profile, and records a minimized global completion event. Identity-provider delete is idempotent because a retry may follow a crash between external and local completion.
6. A missing successor or transient provider, vault, KMS, filesystem, or database failure keeps the operation retryable and observable. Before the seven-day deadline, transient vault unavailability must not erase the only locally stored revocation material; permanently unreadable material may be cryptographically erased immediately. At the deadline, local OAuth and Authorized Data cleanup proceeds even if provider revocation or vault access is unavailable, while the operation remains observable. The deadline raises an escalation but never converts unfinished deletion into an abandoned terminal state.

## Backup and Restore

TencentDB encrypted automated backups and point-in-time recovery retain no more than 35 days in Seoul. COS versioning/lifecycle uses the same maximum residual window. A restore never replaces production in place:

1. Create an isolated recovery environment with no public ingress or external-platform credentials.
2. Restore database and object versions to the selected recovery point.
3. Export the protected deletion and lifecycle ledger entries that occurred after the selected recovery point through the current time. With the isolated recovery administrator role, load those entries and replay every applicable deletion/deny record before enabling any application-role read. Never grant or invoke the recovery replay functions from the online application role.
4. Run migrations, RLS/tenant negative tests, object hash reconciliation, secret/log scans, and deletion-reference checks.
5. Record recovery point, elapsed time, operator/approver, checks, exceptions, and destruction time for the recovery environment.
6. Only a Human Owner-authorized change may promote the recovered state. Destroy the isolated environment after the exercise.

`pnpm test:operations` performs the repository-owned disposable backup → restore drill: it captures a recovery point while Workspace data is live, records a deletion after that point, restores the older backup in isolation, imports the post-recovery protected ledgers, and replays deletion before application access. It verifies schema, RLS, append-only audit maintenance, protected ledger survival, and separation between online application maintenance and administrator-only recovery replay. It is not evidence of TencentDB production backup configuration; D7 supplies that external evidence. Execute the production restore exercise quarterly and after any material backup/topology change.

## Incident Response

Severity is P1 for confirmed secret/token exposure, cross-tenant access, unauthorized external write, or material data loss; P2 for credible containment risk or deletion/revocation SLA risk; P3 for bounded degradation.

1. **Detect and declare:** open the incident record, assign commander, severity, time, systems, and correlation IDs.
2. **Contain:** deny affected sessions/connections, stop workers or deploys where needed, preserve append-only evidence, and rotate exposed secrets/keys.
3. **Eradicate and recover:** fix the cause, verify tenant and external-platform state, restore only through the restore runbook, and monitor recurrence.
4. **Notify:** Security/Legal determine user, processor, regulator, and platform notifications from verified facts and applicable deadlines.
5. **Learn:** complete a blameless review with timeline, impact, root cause, control gaps, owners, due dates, and evidence links.

The D6 tabletop scenario is: a refresh token appears in an application log while a publish worker is active. Expected actions are log sink isolation, connection deny, worker stop for the affected tenant, Google revocation, token/key rotation, restricted evidence preservation, secret-scan expansion, affected-data analysis, notification decision, and verified cleanup before restart. D7 must record participants and timestamps in the protected incident system.

## Vulnerability Management

Every change runs lint, type/static checks, tests, secret scanning, and production dependency audit. High/critical exploitable findings block release. Critical findings have a 24-hour triage target; high findings 72 hours; accepted risk requires Security Owner, scope, compensating control, and expiry. Container/base-image and cloud configuration scans become production-blocking in D7. Report security concerns through `developer@jingtangai.com`; never include secrets or private content in the first message.

## Evidence Register

| Control | Repository evidence | Production evidence owner / Gate |
| --- | --- | --- |
| Disconnect/revoke/token erasure | OAuth adapter tests, D6 lifecycle integration matrix | YouTube Integration Owner / D6 Human E2E then D7 production |
| 7/30-day retention | Controllable-clock, claim-generation, stale-worker fencing, and unified lifecycle integration tests | Operations Owner / D7 monitor evidence |
| Tenant/RBAC/audit integrity | Migration, integration, RBAC, and append-only tests | Security Owner / D7 production negative test |
| Secret/log safety | Redaction unit test and `pnpm test:security` | Security Owner / D7 CLS/Secrets evidence |
| Backup/restore | `pnpm test:operations` disposable drill | Operations Owner / D7 TencentDB/COS drill |
| TLS/encryption/access/alerts | Configuration and this runbook define required checks | Infrastructure/Security Owners / D7 deployed evidence |

## Revision Record

- Revision 1 — 2026-08-22: established D6 runbooks and explicitly separated repository proof from D7 Tencent Cloud production evidence.
- Revision 2 — 2026-08-22: aligned the runbooks with the accepted D6 remediation: disconnect retry no longer stops after five failures, the seven-day local cleanup deadline is explicit, and failed Workspace deletion remains deny-first with durable automatic retry rather than restoring ordinary Workspace access.
- Revision 3 — 2026-08-22: clarified deadline behavior for partial Workspace deletion: local database, session, token, and Authorized Data cleanup cannot be blocked by temporary COS failure; outstanding opaque object keys remain in the durable deletion ledger and continue retrying while the Workspace stays deleted/denied.
- Revision 4 — 2026-08-22: closed D6 worker and evidence gaps with independently supervised publish/disconnect/deletion/retention loops, explicit Google/COS request deadlines, retry after transient polling failures, durable zero-Workspace identity audit capture, and a restore drill that replays deletion against an active recovered Workspace and verifies audit pseudonymization.
- Revision 5 — 2026-08-23: separated online deletion maintenance from isolated recovery replay. The runtime role cannot delete or rewrite the retained deletion ledger, while administrator-only restore functions replay completed deletion records without exposing that authority to the application.
- Revision 6 — 2026-08-23: closed D6 around one database-backed lifecycle control plane, app/worker database-role separation, DB-time leases and generation fences, persistent retry after an SLA breach, transactional account-deletion ownership recheck under a shared Workspace lock with active-successor eligibility, global account audit, and a temporal restore drill that imports post-recovery-point deletion evidence before reads.
- Revision 7 — 2026-08-24: formally corrected the D7 Tencent target from the inherited Singapore assumption to Seoul (`ap-seoul`) after Human Owner clarification. The website and SaaS remain separate resources in the same region. Because Tencent Cloud International Secrets Manager's documented region list does not include Seoul, runtime secret rotation now uses protected KMS-sealed, versioned objects in a dedicated private COS bucket; no cloud resource or production secret was changed by this documentation/configuration revision.
- Revision 8 — 2026-08-24: added the D7 forward-only database/release sequence and role-scoped KMS-sealed bundle publish, activation, rollback, and retirement procedure. The repository now owns a guarded publisher, startup loader, immutable image candidate, protected activation workflow, and release checks; all Tencent, DNS, CIAM, Google, migration, secret publication, deployment, smoke, and rollout operations remain pending explicit Production Change Authorization and protected evidence.
- Revision 9 — 2026-08-24: hardened D7 release readiness by excluding the OAuth callback from ingress access logs, requiring the public Legal/Data production revision before SaaS deployment, checking the D7 queue schema at readiness, and making activation/rollback restore the image and complete Compose/Caddy/release configuration as one release unit. No production write was performed.
- Revision 10 — 2026-08-24: closed the D7 storage-encryption and token-erasure gap. Production COS writers now inherit the Terraform-managed KMS bucket default; versioned OAuth wrapped keys carry an exact COS version reference, and lifecycle destruction removes that version rather than leaving recoverable key material behind a delete marker. No production write was performed.
- Revision 11 — 2026-08-24: corrected the Terraform-state runbook to match provider behavior. The repository now forces private, encrypted COS backend objects; TencentDB/TDMQ bootstrap passwords are handled as one-use sensitive state inputs, invalidated immediately after provisioning, and never reused as active runtime secrets. No production write was performed.
- Revision 12 — 2026-08-24: made the D7 security-scan policy executable. CI and the explicitly authorized production workflow now fail on High/Critical Trivy cloud/container-configuration findings, and the production workflow additionally fails on High/Critical OS or library findings in the exact immutable image before transfer or activation. The reviewed runtime changed from the full Debian/Node toolchain to the immutable Node 24 Alpine variant, removes npm/Corepack/Yarn from the final filesystem, starts built JavaScript directly as a non-root user, and scans with vulnerability-only image semantics. The scanner action is pinned to a reviewed full commit SHA; no production write was performed.
- Revision 13 — 2026-08-24: closed the ingress-image exception exposed by formal D7 Code Review. The release now builds Caddy from an exact reviewed upstream source revision with explicit patched Go dependencies into a scratch runtime, blocks both application and ingress images on High/Critical findings, transfers and checksum-verifies both archives, verifies both Git-revision labels, and rolls the two images back as one release unit. TDMQ configure permission was also narrowed to the named `jingtang.*` topology. No production write was performed.
- Revision 14 — 2026-08-24: narrowed the production worker identity boundary so it receives only the CIAM user-store identifier required for lifecycle deletion and never receives the interactive CIAM OAuth client secret. Durable publish retry ownership was also made explicit: once a transient provider state has been persisted back to the database outbox with a future availability time, the current TDMQ delivery is acknowledged instead of hot-requeued in parallel. No production write was performed.
