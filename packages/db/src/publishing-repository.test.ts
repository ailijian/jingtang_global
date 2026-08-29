import { OutboxState, PlatformExecutionState } from "./generated/client.js";
import { platformExecutionRetryable } from "./publishing-repository.js";
import { describe, expect, it } from "vitest";

describe("platformExecutionRetryable", () => {
  const safelyFailed = {
    state: PlatformExecutionState.FAILED,
    providerId: null,
    providerUrl: null,
    outboxState: OutboxState.DEAD,
  } as const;

  it("allows retry only after a terminal failure without an external post identity", () => {
    expect(platformExecutionRetryable(safelyFailed)).toBe(true);
  });

  it.each([
    { ...safelyFailed, state: PlatformExecutionState.PUBLISHING },
    { ...safelyFailed, state: PlatformExecutionState.NEEDS_ATTENTION },
    { ...safelyFailed, providerId: "provider-post-id" },
    { ...safelyFailed, providerUrl: "https://example.test/post" },
    { ...safelyFailed, outboxState: OutboxState.CLAIMED },
    { ...safelyFailed, outboxState: null },
  ])("rejects an unsafe or non-terminal execution: %o", (execution) => {
    expect(platformExecutionRetryable(execution)).toBe(false);
  });
});
