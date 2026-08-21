import { describe, expect, it } from "vitest";

import { canApplyContentCommand, contentStatusAfterDecision } from "./content.js";

describe("content lifecycle", () => {
  it("keeps submission and approval as separate commands", () => {
    expect(canApplyContentCommand("draft", "submit")).toBe(true);
    expect(canApplyContentCommand("draft", "approve")).toBe(false);
    expect(canApplyContentCommand("pending_approval", "approve")).toBe(true);
    expect(canApplyContentCommand("pending_approval", "edit")).toBe(false);
  });

  it("requires a new draft revision after a terminal decision", () => {
    expect(canApplyContentCommand("rejected", "edit")).toBe(true);
    expect(canApplyContentCommand("approved", "edit")).toBe(true);
    expect(canApplyContentCommand("rejected", "submit")).toBe(false);
  });

  it("maps review decisions only to lifecycle status", () => {
    expect(contentStatusAfterDecision("approved")).toBe("approved");
    expect(contentStatusAfterDecision("rejected")).toBe("rejected");
  });
});
