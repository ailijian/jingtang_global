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
  acceptance_method: "registration_checkbox" | "reconsent_gate";
  accepted_at: string;
}

export interface ChannelSummary {
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
  granted_scopes: string[];
  capabilities: {
    publish: "available" | "beta" | "not_available";
    schedule: "available" | "beta" | "not_available";
  };
  authorized_at?: string | null;
  refreshed_at?: string | null;
  denied_at?: string | null;
}

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
