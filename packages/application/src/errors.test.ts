import { describe, expect, it } from "vitest";

import { ApplicationError, isApplicationError } from "./errors.js";

describe("application error recognition", () => {
  it("recognizes a local ApplicationError", () => {
    expect(
      isApplicationError(new ApplicationError("authentication_failed", "Invalid credentials", 401)),
    ).toBe(true);
  });

  it("recognizes a structurally valid ApplicationError from another module realm", () => {
    const crossRealmError = Object.assign(new Error("Invalid credentials"), {
      name: "ApplicationError",
      code: "authentication_failed",
      status: 401,
    });
    expect(isApplicationError(crossRealmError)).toBe(true);
  });

  it("rejects arbitrary errors that only imitate the class name", () => {
    const invalidError = Object.assign(new Error("Unexpected"), {
      name: "ApplicationError",
      code: "not_a_public_code",
      status: 200,
    });
    expect(isApplicationError(invalidError)).toBe(false);
  });
});
