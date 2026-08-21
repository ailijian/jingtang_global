import type { ContentStatus } from "@jingtang/domain";
import type { MessageKey } from "@jingtang/i18n";

export const contentStatusMessage: Readonly<Record<ContentStatus, MessageKey>> = {
  draft: "content.status.draft",
  pending_approval: "content.status.pending_approval",
  rejected: "content.status.rejected",
  approved: "content.status.approved",
};
