export const supportedLocales = ["en", "zh-CN"] as const;

export type Locale = (typeof supportedLocales)[number];

export interface ActorRef {
  readonly type: "user" | "system";
  readonly id: string;
}

export interface AuditTarget {
  readonly type:
    | "user"
    | "workspace"
    | "membership"
    | "invitation"
    | "consent"
    | "session"
    | "channel"
    | "source_asset"
    | "content"
    | "content_revision"
    | "approval"
    | "publishing_intent"
    | "platform_execution";
  readonly id: string;
}

export const auditActions = [
  "identity.registered",
  "identity.login",
  "identity.logout",
  "consent.accepted",
  "workspace.created",
  "workspace.selected",
  "member.invited",
  "member.joined",
  "member.removed",
  "member.role_changed",
  "channel.connection_started",
  "channel.connected",
  "channel.connection_denied",
  "channel.reauthorization_required",
  "channel.disconnect_started",
  "channel.disconnect_failed",
  "channel.disconnected",
  "locale.changed",
  "source_asset.uploaded",
  "source_asset.upload_failed",
  "content.created",
  "content.edited",
  "content.submitted",
  "content.approved",
  "content.rejected",
  "publishing.confirmed",
  "platform.publish_started",
  "platform.publish_initialized",
  "platform.uploaded",
  "platform.published",
  "platform.publish_failed",
  "platform.publish_cancelled",
  "data.deletion_requested",
  "data.deletion_started",
  "data.deletion_completed",
  "data.deletion_failed",
  "data.retention_refreshed",
  "data.retention_deleted",
  "authorization.denied",
] as const;

export type AuditAction = (typeof auditActions)[number];
export type AuditResult = "success" | "denied" | "failed";

export const contentStatuses = ["draft", "pending_approval", "rejected", "approved"] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export const sourceAssetStatuses = ["pending_upload", "complete", "failed"] as const;
export type SourceAssetStatus = (typeof sourceAssetStatuses)[number];

export const platforms = ["youtube", "facebook", "tiktok"] as const;
export type Platform = (typeof platforms)[number];

export const privacyStatuses = ["unselected", "private", "unlisted", "public"] as const;
export type PrivacyStatus = (typeof privacyStatuses)[number];

export const approvalResults = ["approved", "rejected"] as const;
export type ApprovalResult = (typeof approvalResults)[number];
