import { describe, expect, it } from "vitest";

import { hasPermission, permissionDecision, permissions, roles } from "./rbac.js";

describe("deny-by-default RBAC", () => {
  it("grants every V1 permission only to owner/admin", () => {
    expect(permissions.every((permission) => hasPermission("owner_admin", permission))).toBe(true);
  });

  it("keeps viewer read-only", () => {
    expect(hasPermission("viewer", "workspace.read")).toBe(true);
    expect(hasPermission("viewer", "content.read")).toBe(true);
    expect(hasPermission("viewer", "workspace.manage")).toBe(false);
    expect(hasPermission("viewer", "content.edit")).toBe(false);
  });

  it("keeps approval and publish separate from editor actions", () => {
    expect(hasPermission("editor", "content.submit")).toBe(true);
    expect(hasPermission("editor", "content.approve")).toBe(false);
    expect(hasPermission("editor", "content.publish")).toBe(false);
    expect(hasPermission("approver_publisher", "content.approve")).toBe(true);
    expect(hasPermission("approver_publisher", "content.publish")).toBe(true);
    expect(hasPermission("approver_publisher", "content.edit")).toBe(false);
  });

  it("denies missing membership for every role-shaped request", () => {
    expect(roles).toHaveLength(4);
    expect(permissionDecision(undefined, "workspace.read")).toEqual({
      allowed: false,
      reason: "missing_membership",
    });
  });
});
