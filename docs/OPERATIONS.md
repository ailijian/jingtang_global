# JINGTANG Operations Authority

- Status: Approved operating procedure; production evidence pending D7
- Operations Revision: 1
- Effective Date: 2026-08-22
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
5. On failure, keep access denied, record a safe failure category, emit a structured warning for D7 alert routing, retry at most five times from the lifecycle worker, and expose an explicit manual retry. Never restore the old connection automatically.

### Workspace data deletion

1. Require an Owner/Admin, the destructive confirmation phrase, and the exact Workspace name.
2. Record a deletion reference, deny platform work, cancel queued work, and require all already-started channel operation leases to finish or expire before revoking connected authorizations and removing live objects.
3. Delete Workspace content and connection data; remove memberships/session selection; pseudonymize the retained 365-day audit/deletion evidence.
4. Return the deletion reference outside the deleted Workspace. Third-party-held YouTube content is never implied to be deleted.
5. A failed step leaves platform access denied, restores only the management surface needed to inspect/retry, and raises an operator alert.

### Scheduled Authorized Data control

The worker checks due YouTube records every minute. Data reaching its 30-day refresh deadline is refreshed from the authorized provider and receives a new 30-day deadline. An unrefreshable record is erased and marked `reauthorization_required`; access is not silently restored. In-product revocation/deletion runs immediately and therefore remains inside the seven-calendar-day maximum. The controllable-clock integration test is the blocking machine proof; operators alert on any due record not resolved in the next worker cycle.

## Backup and Restore

TencentDB encrypted automated backups and point-in-time recovery retain no more than 35 days in Singapore. COS versioning/lifecycle uses the same maximum residual window. A restore never replaces production in place:

1. Create an isolated recovery environment with no public ingress or external-platform credentials.
2. Restore database and object versions to the selected recovery point.
3. Apply every deletion/deny ledger record through the current time before enabling application reads.
4. Run migrations, RLS/tenant negative tests, object hash reconciliation, secret/log scans, and deletion-reference checks.
5. Record recovery point, elapsed time, operator/approver, checks, exceptions, and destruction time for the recovery environment.
6. Only a Human Owner-authorized change may promote the recovered state. Destroy the isolated environment after the exercise.

`pnpm test:operations` performs the repository-owned disposable backup → restore drill and verifies schema, RLS, append-only audit maintenance, and deletion-ledger survival. It is not evidence of TencentDB production backup configuration; D7 supplies that external evidence. Execute the production restore exercise quarterly and after any material backup/topology change.

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
| 7/30-day retention | Controllable-clock integration test and worker scheduler | Operations Owner / D7 monitor evidence |
| Tenant/RBAC/audit integrity | Migration, integration, RBAC, and append-only tests | Security Owner / D7 production negative test |
| Secret/log safety | Redaction unit test and `pnpm test:security` | Security Owner / D7 CLS/Secrets evidence |
| Backup/restore | `pnpm test:operations` disposable drill | Operations Owner / D7 TencentDB/COS drill |
| TLS/encryption/access/alerts | Configuration and this runbook define required checks | Infrastructure/Security Owners / D7 deployed evidence |

## Revision Record

- Revision 1 — 2026-08-22: established D6 runbooks and explicitly separated repository proof from D7 Tencent Cloud production evidence.
