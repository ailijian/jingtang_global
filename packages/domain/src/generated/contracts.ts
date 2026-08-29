// Generated from contracts/manifest.yaml. Do not edit by hand.

export interface Workspace {
  workspace_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface MembershipPermissionDecision {
  membership_id: string;
  workspace_id: string;
  user_id: string;
  role: "owner_admin" | "editor" | "approver_publisher" | "viewer";
  permission:
    | "workspace.read"
    | "workspace.manage"
    | "member.invite"
    | "member.remove"
    | "member.role.assign"
    | "channel.read"
    | "channel.connect"
    | "channel.reauthorize"
    | "channel.disconnect"
    | "content.read"
    | "content.create"
    | "content.edit"
    | "content.submit"
    | "content.approve"
    | "content.reject"
    | "content.publish"
    | "activity.read"
    | "data.delete";
  allowed: boolean;
  denial_reason?: "missing_membership" | "role_denied" | null;
}

export interface LocalePreference {
  user_id: string;
  locale: "en" | "zh-CN";
  updated_at: string;
}

export interface ConsentRecord {
  consent_id: string;
  user_id: string;
  terms_version: string;
  privacy_version: string;
  data_purpose_version: string;
  displayed_locale: "en" | "zh-CN";
  acceptance_method:
    | "registration_checkbox"
    | "reconsent_gate"
    | "youtube_connection_checkbox"
    | "facebook_connection_checkbox"
    | "instagram_connection_checkbox"
    | "tiktok_connection_checkbox";
  accepted_at: string;
}

export type ChannelSummary = {
  [k: string]: unknown;
} & {
  channel_id: string;
  workspace_id: string;
  platform: "youtube" | "facebook" | "instagram" | "tiktok" | "linkedin" | "pinterest" | "x";
  external_account_id?: string | null;
  display_name?: string | null;
  state:
    | "not_connected"
    | "connecting"
    | "connected"
    | "reauthorization_required"
    | "disconnecting"
    | "disconnected";
  provider_removal_state: "not_applicable" | "pending_user_action" | "confirmed";
  granted_scopes: string[];
  capabilities: {
    publish: "available" | "beta" | "not_available";
    schedule: "available" | "beta" | "not_available";
  };
  authorized_at?: string | null;
  refreshed_at?: string | null;
  denied_at?: string | null;
};

export interface AuditEvent {
  event_id: string;
  event_version: 1;
  occurred_at: string;
  recorded_at: string;
  workspace_id: string;
  actor: {
    type: "user" | "system";
    id: string;
  };
  action: string;
  target: {
    type: string;
    id: string;
  };
  result: "success" | "denied" | "failed";
  correlation_id: string;
  metadata: {
    [k: string]: string | number | boolean | null;
  };
}

export interface SourceAsset {
  asset_id: string;
  workspace_id: string;
  content_id: string | null;
  filename: string;
  media_type: string;
  byte_size: number;
  duration_seconds?: number | null;
  sha256: string;
  status: "pending_upload" | "complete" | "failed";
  ownership_confirmed: true;
  failure_category?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Content {
  content_id: string;
  workspace_id: string;
  internal_title: string;
  status: "draft" | "pending_approval" | "rejected" | "approved";
  current_revision_id: string;
  current_revision_number: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export type PlatformVersion = {
  [k: string]: unknown;
} & {
  platform_version_id: string;
  workspace_id: string;
  revision_id: string;
  platform: "youtube" | "facebook" | "instagram" | "tiktok";
  account_reference: string;
  account_display_name: string;
  title: string;
  description: string;
  privacy_status: "private" | "unlisted" | "public" | "unselected";
  made_for_kids: boolean;
  validation_status: "valid" | "invalid";
  created_at: string;
  updated_at: string;
};

export interface Approval {
  approval_id: string;
  workspace_id: string;
  content_id: string;
  revision_id: string;
  actor_user_id: string;
  result: "approved" | "rejected";
  reason: string | null;
  decided_at: string;
}

export interface PublishingIntent {
  publishing_intent_id: string;
  workspace_id: string;
  content_id: string;
  revision_id: string;
  /**
   * @minItems 1
   */
  platform_version_ids: [string, ...string[]];
  /**
   * @minItems 1
   */
  account_references: [string, ...string[]];
  payload_snapshot: {
    revision_id: string;
    /**
     * @minItems 1
     */
    versions: [
      {
        [k: string]: unknown;
      },
      ...{
        [k: string]: unknown;
      }[],
    ];
  };
  permission_decision: "allowed";
  state: "none" | "ready" | "scheduled" | "cancelled";
  mode: "immediate" | "scheduled";
  confirmed_by_user_id: string;
  consent_version: string;
  payload_hash: string;
  idempotency_key: string;
  confirmed_at: string;
}

export type PlatformExecution = {
  [k: string]: unknown;
} & {
  platform_execution_id: string;
  workspace_id: string;
  publishing_intent_id: string;
  platform_version_id: string;
  platform: "youtube" | "facebook" | "instagram" | "tiktok";
  account_reference: string;
  operation: "publish";
  attempt: number;
  idempotency_key: string;
  state:
    | "not_started"
    | "publishing"
    | "processing"
    | "published"
    | "failed"
    | "needs_attention"
    | "cancelled";
  failure_category?: string | null;
  provider_id?: string | null;
  provider_url?: string | null;
  provider_create_state?: "not_started" | "started" | "succeeded" | "ambiguous" | "failed";
  provider_publish_state?: "not_started" | "started" | "succeeded" | "ambiguous" | "failed";
  provider_resource_id?: string | null;
  provider_result_id?: string | null;
  created_at: string;
  updated_at: string;
};
