import { describe, expect, it } from "vitest";

import { parsePublishCommandMessage, tdmqDeadLetterTtlMs } from "./rabbit-command-transport.js";

const validMessage = {
  version: 1,
  outboxMessageId: "14e1516a-386b-4a2c-988d-3eb41cdb9db5",
  workspaceId: "3e03a71a-6763-4322-ac80-8f650862eca1",
  platformExecutionId: "12c35f44-1517-46d3-ab67-67852a79406d",
  topic: "platform.youtube.publish.v1",
} as const;

describe("TDMQ publish command contract", () => {
  it("expires dead-letter references within the approved fourteen-day maximum", () => {
    expect(tdmqDeadLetterTtlMs).toBe(14 * 24 * 60 * 60 * 1_000);
  });

  it("accepts the versioned opaque-reference command", () => {
    expect(parsePublishCommandMessage(Buffer.from(JSON.stringify(validMessage)))).toEqual(
      validMessage,
    );
  });

  it.each([
    Buffer.from("not-json"),
    Buffer.from(JSON.stringify({ ...validMessage, version: 2 })),
    Buffer.from(JSON.stringify({ ...validMessage, workspaceId: "not-a-uuid" })),
    Buffer.from(JSON.stringify({ ...validMessage, topic: "unexpected.topic" })),
  ])("rejects malformed or unsupported commands", (payload) => {
    expect(() => parsePublishCommandMessage(payload)).toThrow("invalid_tdmq_command");
  });
});
