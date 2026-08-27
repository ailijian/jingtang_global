import { describe, expect, it } from "vitest";

import {
  facebookAuthorizationRequiresRefresh,
  facebookExecutionFailureDisposition,
  parseStoredFacebookConnectionCandidate,
} from "./facebook.js";

describe("facebook publishing failure policy", () => {
  it("requires attention when pre-publish identity or Page capability validation changes", () => {
    expect(facebookExecutionFailureDisposition("authorized_channel_identity_mismatch", 1)).toEqual({
      needsAttention: true,
      terminal: true,
    });
  });

  it("reuses a safely unexpired long-lived user token", () => {
    const now = Date.parse("2026-08-27T05:30:00.000Z");

    expect(facebookAuthorizationRequiresRefresh("2026-10-25T11:35:49.393Z", now)).toBe(false);
    expect(facebookAuthorizationRequiresRefresh("2026-08-27T05:30:59.999Z", now)).toBe(true);
    expect(facebookAuthorizationRequiresRefresh("invalid", now)).toBe(true);
  });

  it("normalizes the legacy Page task snapshot to capabilities", () => {
    expect(
      parseStoredFacebookConnectionCandidate({
        userAccessToken: "user-token",
        expiresAt: "2026-08-26T00:00:00.000Z",
        pages: [
          {
            id: "page-id",
            displayName: "Jingtang",
            accessToken: "page-token",
            tasks: ["PROFILE_PLUS_CREATE_CONTENT"],
          },
        ],
      }),
    ).toEqual({
      userAccessToken: "user-token",
      expiresAt: "2026-08-26T00:00:00.000Z",
      pages: [
        {
          id: "page-id",
          displayName: "Jingtang",
          accessToken: "page-token",
          capabilities: ["PROFILE_PLUS_CREATE_CONTENT"],
        },
      ],
    });
  });
});
