export const roles = ["owner_admin", "editor", "approver_publisher", "viewer"] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "workspace.read",
  "workspace.manage",
  "member.invite",
  "member.remove",
  "member.role.assign",
  "channel.read",
  "channel.connect",
  "channel.reauthorize",
  "channel.disconnect",
  "content.read",
  "content.create",
  "content.edit",
  "content.submit",
  "content.approve",
  "content.reject",
  "content.publish",
  "activity.read",
  "data.delete",
] as const;

export type Permission = (typeof permissions)[number];

const readable: readonly Permission[] = [
  "workspace.read",
  "channel.read",
  "content.read",
  "activity.read",
];

export const permissionMatrix: Readonly<Record<Role, readonly Permission[]>> = {
  owner_admin: permissions,
  editor: [...readable, "content.create", "content.edit", "content.submit"],
  approver_publisher: [...readable, "content.approve", "content.reject", "content.publish"],
  viewer: readable,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionMatrix[role].includes(permission);
}

export function permissionDecision(
  role: Role | undefined,
  permission: Permission,
):
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "missing_membership" | "role_denied" } {
  if (role === undefined) {
    return { allowed: false, reason: "missing_membership" };
  }
  return hasPermission(role, permission)
    ? { allowed: true }
    : { allowed: false, reason: "role_denied" };
}
