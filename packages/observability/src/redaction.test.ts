import { describe, expect, it } from "vitest";

import { redactForLog } from "./index.js";

describe("allow-listed logging boundary", () => {
  it("redacts forbidden fields and email-shaped values", () => {
    expect(
      redactForLog({
        workspaceId: "ws_1",
        email: "person@example.com",
        nested: { authorization: "Bearer test-secret", note: "person@example.com" },
      }),
    ).toEqual({
      workspaceId: "ws_1",
      email: "[REDACTED]",
      nested: { authorization: "[REDACTED]", note: "[REDACTED_EMAIL]" },
    });
  });
});
