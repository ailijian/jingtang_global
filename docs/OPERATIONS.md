# JINGTANG Operations Authority

- Status: Approved operating procedure; production evidence pending D7
- Operations Revision: 6
- Effective Date: 2026-08-23
- Owner: JINGTANG Operations Owner
- Architecture dependency: [`docs/architecture/README.md`](architecture/README.md)
- Security/Data dependency: [`docs/security-and-data/README.md`](security-and-data/README.md)

## Boundary

This document owns the repeatable operating procedures for the SaaS/BFF, worker, PostgreSQL, object storage, OAuth lifecycle, monitoring, backup/restore, incident response, vulnerability management, and production access. Architecture owns topology; Security/Data owns policy and retention; code and infrastructure configuration own implemented mechanics. D7 must attach protected Tencent Cloud production evidence before any control below is described publicly as production-verified.

## Environment and Change Control

Local/test, integration, and production use separate database, object-storage bucket, queue, KMS key, secret namespace, OAuth client, redirect URI, and log destination. Production deploys require a reviewed immutable commit, successful blocking CI, a protected deployment environment, and explicit Human Owner authorization. Database changes deploy forward before compatible application code; destructive rollback is prohibited. Application rollback keeps the expanded schema or restores into a new isolated database.

Production access is deny-by-default. Operator access requires MFA, a named person, least-privilege role, reason/ticket reference, start/expiry time, and a protected access record. Break-glass access requires a Security Owner and a second approver; credentials rotate immediately afterward. No token value, user content, or production secret enters a ticket, repository, screenshot, or ordinary log.

## Runtime Controls and Monitoring

- Ingress permits TLS 1.2 or newer and redirects HTTP to HTTPS. Internal database, queue, object storage, KMS, and secret endpoints are private.
- PostgreSQL and object storage use Tencent-managed encryption; production OAuth tokens additionally use per-connection Tencent KMS envelope encryption. The local envelope adapter is test-only.
- The SaaS/BFF and worker use distinct non-superuser PostgreSQL roles. The app role may persist lifecycle requests but cannot claim them or execute cleanup/pseudonymization functions; only the worker role may claim fenced operations and run lifecycle effects.
- Secrets are read from Tencent Secrets Manager at runtime and rotated without embedding values in images. Repository and CI secret scans are blocking.
- Structured logs use allow-listed identifiers and safe failure categories. Authorization headers, cookies, OAuth codes/tokens, signed URLs, email addresses, raw assets, and final content text are prohibited.
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

TencentDB encrypted automated backups and point-in-time recovery retain no more than 35 days in Singapore. COS versioning/lifecycle uses the same maximum residual window. A restore never replaces production in place:

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
