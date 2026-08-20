import { randomUUID } from "node:crypto";

import {
  createDatabaseClient,
  createSession,
  createWorkspace,
  getMembershipRole,
  listMembers,
  readSession,
  recordConsent,
  removeMember,
  selectWorkspace,
  upsertIdentityUser,
  withTenant,
} from "../../packages/db/src/index.js";
import { permissionDecision, type Role } from "../../packages/domain/src/index.js";
import { Role as DatabaseRole } from "../../packages/db/src/generated/client.js";
import { afterAll, describe, expect, it } from "vitest";

const appUrl = process.env.DATABASE_URL;
if (!appUrl) throw new Error("DATABASE_URL is required for integration tests");
const db = createDatabaseClient(appUrl);
const databaseRoles: Readonly<Record<Role, DatabaseRole>> = {
  owner_admin: DatabaseRole.OWNER_ADMIN,
  editor: DatabaseRole.EDITOR,
  approver_publisher: DatabaseRole.APPROVER_PUBLISHER,
  viewer: DatabaseRole.VIEWER,
};

async function fixture(label: string) {
  const user = await upsertIdentityUser(db, {
    subject: `integration-${label}-${randomUUID()}`,
    email: `${label}-${randomUUID()}@example.test`,
    name: label,
    locale: label === "zh" ? "zh-CN" : "en",
  });
  const session = await createSession(db, {
    userId: user.id,
    secret: "integration-secret-at-least-32-bytes",
  });
  const workspace = await createWorkspace(db, {
    name: `${label} Workspace`,
    userId: user.id,
    sessionId: session.id,
    correlationId: randomUUID(),
  });
  return { user, session, workspace };
}

afterAll(async () => db.$disconnect());

describe("D2 tenant and RBAC enforcement", () => {
  it("blocks a tenant context from reading another Workspace", async () => {
    const first = await fixture("first");
    const second = await fixture("second");
    const leaked = await withTenant(db, first.workspace.id, (transaction) =>
      transaction.workspace.findUnique({ where: { id: second.workspace.id } }),
    );
    expect(leaked).toBeNull();
  });

  it.each([
    ["owner_admin", "member.invite", true],
    ["editor", "content.edit", true],
    ["editor", "content.approve", false],
    ["approver_publisher", "content.publish", true],
    ["approver_publisher", "content.edit", false],
    ["viewer", "content.read", true],
    ["viewer", "content.edit", false],
  ] as const)("enforces %s decision for %s", (role, permission, expected) => {
    expect(permissionDecision(role, permission).allowed).toBe(expected);
  });

  it("reads the persisted owner role through the tenant-aware repository", async () => {
    const owner = await fixture("owner");
    await expect(getMembershipRole(db, owner.workspace.id, owner.user.id)).resolves.toBe(
      "owner_admin",
    );
  });

  it("loads all four persisted roles before applying the allow/deny matrix", async () => {
    const owner = await fixture("matrix-owner");
    const cases = [
      ["owner_admin", owner.user.id, "member.invite", true],
      ["editor", null, "content.approve", false],
      ["approver_publisher", null, "content.publish", true],
      ["viewer", null, "content.edit", false],
    ] as const;
    for (const [expectedRole, existingUserId, permission, expected] of cases) {
      let userId = existingUserId;
      if (!userId) {
        const user = await upsertIdentityUser(db, {
          subject: `matrix-${expectedRole}-${randomUUID()}`,
          email: `matrix-${expectedRole}-${randomUUID()}@example.test`,
          name: expectedRole,
          locale: "en",
        });
        userId = user.id;
        await withTenant(db, owner.workspace.id, (transaction) =>
          transaction.membership.create({
            data: {
              workspaceId: owner.workspace.id,
              userId,
              role: databaseRoles[expectedRole],
            },
          }),
        );
      }
      const persistedRole = await getMembershipRole(db, owner.workspace.id, userId);
      expect(persistedRole).toBe(expectedRole);
      expect(permissionDecision(persistedRole, permission).allowed).toBe(expected);
    }
  });

  it("rejects mutation of append-only audit evidence", async () => {
    const owner = await fixture("audit");
    await expect(
      withTenant(db, owner.workspace.id, async (transaction) => {
        const event = await transaction.auditEvent.findFirstOrThrow({
          where: { workspaceId: owner.workspace.id },
        });
        await transaction.auditEvent.update({
          where: { id: event.id },
          data: { result: "failed" },
        });
      }),
    ).rejects.toThrow(/append-only|permission denied/);
  });

  it("serializes concurrent Owner removal and preserves the last Owner", async () => {
    const firstOwner = await fixture("owner-lock");
    const secondOwner = await upsertIdentityUser(db, {
      subject: `owner-lock-second-${randomUUID()}`,
      email: `owner-lock-second-${randomUUID()}@example.test`,
      name: "Second Owner",
      locale: "en",
    });
    await withTenant(db, firstOwner.workspace.id, (transaction) =>
      transaction.membership.create({
        data: {
          workspaceId: firstOwner.workspace.id,
          userId: secondOwner.id,
          role: DatabaseRole.OWNER_ADMIN,
        },
      }),
    );
    const owners = await listMembers(db, firstOwner.workspace.id);
    const attempts = await Promise.allSettled(
      owners.map((owner) =>
        removeMember(db, {
          workspaceId: firstOwner.workspace.id,
          actorUserId: firstOwner.user.id,
          membershipId: owner.id,
          correlationId: randomUUID(),
        }),
      ),
    );
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (await listMembers(db, firstOwner.workspace.id)).filter(
        (member) => member.role === "owner_admin",
      ),
    ).toHaveLength(1);
  });

  it("moves active sessions to a remaining Workspace when membership is removed", async () => {
    const owner = await fixture("removal-owner");
    const member = await fixture("removal-member");
    const membership = await withTenant(db, owner.workspace.id, (transaction) =>
      transaction.membership.create({
        data: {
          workspaceId: owner.workspace.id,
          userId: member.user.id,
          role: DatabaseRole.VIEWER,
        },
      }),
    );
    await selectWorkspace(db, {
      workspaceId: owner.workspace.id,
      userId: member.user.id,
      sessionId: member.session.id,
      correlationId: randomUUID(),
    });

    await removeMember(db, {
      workspaceId: owner.workspace.id,
      actorUserId: owner.user.id,
      membershipId: membership.id,
      correlationId: randomUUID(),
    });

    const session = await readSession(
      db,
      member.session.token,
      "integration-secret-at-least-32-bytes",
    );
    expect(session?.currentWorkspaceId).toBe(member.workspace.id);
    await expect(
      getMembershipRole(db, owner.workspace.id, member.user.id),
    ).resolves.toBeUndefined();
  });

  it("persists canonical consent versions and displayed locale", async () => {
    const user = await upsertIdentityUser(db, {
      subject: `consent-${randomUUID()}`,
      email: `consent-${randomUUID()}@example.test`,
      name: "Consent Test",
      locale: "zh-CN",
    });
    await recordConsent(db, {
      userId: user.id,
      termsVersion: "d2-test-terms-v1",
      privacyVersion: "d2-test-privacy-v1",
      dataPurposeVersion: "d2-test-purpose-v1",
      displayedLocale: "zh-CN",
    });
    const persisted = await db.consentRecord.findFirstOrThrow({ where: { userId: user.id } });
    expect(persisted).toMatchObject({ displayedLocale: "ZH_CN", termsVersion: "d2-test-terms-v1" });
  });
});
