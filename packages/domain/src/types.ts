export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export interface ActorRef {
  readonly type: "user" | "system";
  readonly id: string;
}

export interface AuditTarget {
  readonly type: "user" | "workspace" | "membership" | "invitation" | "consent" | "session";
  readonly id: string;
}

export const auditActions = [
  "identity.registered",
  "identity.login",
  "identity.logout",
  "identity.password_reset_requested",
  "consent.accepted",
  "workspace.created",
  "workspace.selected",
  "member.invited",
  "member.joined",
  "member.removed",
  "member.role_changed",
  "locale.changed",
  "authorization.denied",
] as const;

export type AuditAction = (typeof auditActions)[number];
export type AuditResult = "success" | "denied" | "failed";
