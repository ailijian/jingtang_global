import type { ApprovalResult, ContentStatus } from "./types.js";

export type ContentCommand = "edit" | "submit" | "approve" | "reject";

const allowed: Readonly<Record<ContentStatus, readonly ContentCommand[]>> = {
  draft: ["edit", "submit"],
  pending_approval: ["approve", "reject"],
  rejected: ["edit"],
  approved: ["edit"],
};

export function canApplyContentCommand(status: ContentStatus, command: ContentCommand): boolean {
  return allowed[status].includes(command);
}

export function contentStatusAfterDecision(result: ApprovalResult): ContentStatus {
  return result;
}
