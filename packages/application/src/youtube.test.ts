import { describe, expect, it, vi } from "vitest";

import {
  authorizationMaterialFailureRequiresLocalErasure,
  authorizedDataRefreshFailureRequiresDeletion,
  persistSealedTokenEnvelope,
  shouldResetYouTubeExecutionForRetry,
  youtubeExecutionFailureDisposition,
} from "./youtube.js";

describe("YouTube execution failure disposition", () => {
  it.each(["service_unavailable", "rate_limited", "provider_processing_pending"])(
    "retries transient %s failures before the bounded final attempt",
    (failureCategory) => {
      expect(youtubeExecutionFailureDisposition(failureCategory, 1)).toEqual({
        needsAttention: false,
        terminal: false,
      });
      expect(youtubeExecutionFailureDisposition(failureCategory, 4)).toEqual({
        needsAttention: false,
        terminal: true,
      });
    },
  );

  it.each(["authentication_failed", "permission_denied", "execution_recovery_required"])(
    "moves user-correctable %s failures to Needs Attention",
    (failureCategory) => {
      expect(youtubeExecutionFailureDisposition(failureCategory, 1)).toEqual({
        needsAttention: true,
        terminal: true,
      });
    },
  );

  it("does not retry invalid source assets", () => {
    expect(youtubeExecutionFailureDisposition("source_asset_size_mismatch", 1)).toEqual({
      needsAttention: false,
      terminal: true,
    });
  });

  it("never retries an execution that is already terminal", () => {
    expect(youtubeExecutionFailureDisposition("execution_terminal", 1)).toEqual({
      needsAttention: false,
      terminal: true,
    });
  });
});

describe("YouTube transient retry reset", () => {
  it("resets an upload that failed before a provider reference was persisted", () => {
    expect(
      shouldResetYouTubeExecutionForRetry({
        executionState: "publishing",
        providerReferencePersisted: false,
      }),
    ).toBe(true);
  });

  it("keeps processing state after the provider accepted the upload", () => {
    expect(
      shouldResetYouTubeExecutionForRetry({
        executionState: "publishing",
        providerReferencePersisted: true,
      }),
    ).toBe(false);
    expect(
      shouldResetYouTubeExecutionForRetry({
        executionState: "processing",
        providerReferencePersisted: true,
      }),
    ).toBe(false);
  });
});

describe("YouTube token envelope persistence", () => {
  it("destroys a newly sealed key when persistence fails", async () => {
    const vault = {
      seal: vi.fn().mockResolvedValue({ ciphertext: "ciphertext", keyReference: "key-ref" }),
      open: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
    const persistenceError = new Error("persistence_failed");

    await expect(
      persistSealedTokenEnvelope(vault, { refreshToken: "secret" }, () =>
        Promise.reject(persistenceError),
      ),
    ).rejects.toBe(persistenceError);
    expect(vault.destroy).toHaveBeenCalledWith("key-ref");
  });

  it("retains the sealed key after successful persistence", async () => {
    const vault = {
      seal: vi.fn().mockResolvedValue({ ciphertext: "ciphertext", keyReference: "key-ref" }),
      open: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      persistSealedTokenEnvelope(vault, { refreshToken: "secret" }, async (envelope) =>
        Promise.resolve(envelope.keyReference),
      ),
    ).resolves.toBe("key-ref");
    expect(vault.destroy).not.toHaveBeenCalled();
  });

  it("surfaces both persistence and cleanup failures instead of hiding an orphaned key", async () => {
    const persistenceError = new Error("persistence_failed");
    const cleanupError = new Error("cleanup_failed");
    const vault = {
      seal: vi.fn().mockResolvedValue({ ciphertext: "ciphertext", keyReference: "key-ref" }),
      open: vi.fn(),
      destroy: vi.fn().mockRejectedValue(cleanupError),
    };

    const failure = await persistSealedTokenEnvelope(vault, { refreshToken: "secret" }, () =>
      Promise.reject(persistenceError),
    ).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).message).toBe("token_envelope_persistence_cleanup_failed");
    expect((failure as AggregateError).errors).toEqual([persistenceError, cleanupError]);
  });
});

describe("YouTube Authorized Data refresh failure disposition", () => {
  it("retries transient failures only while the 30-day deadline has not elapsed", () => {
    expect(authorizedDataRefreshFailureRequiresDeletion("service_unavailable", false)).toBe(false);
    expect(authorizedDataRefreshFailureRequiresDeletion("service_unavailable", true)).toBe(true);
  });

  it.each(["authentication_failed", "permission_denied", "not_found", "key_destroyed"])(
    "deletes immediately after unrecoverable %s failures",
    (failureCategory) => {
      expect(authorizedDataRefreshFailureRequiresDeletion(failureCategory, false)).toBe(true);
    },
  );
});

describe("YouTube authorization material cleanup disposition", () => {
  it("retries transient vault failures before the seven-day deletion deadline", () => {
    expect(authorizationMaterialFailureRequiresLocalErasure("service_unavailable", false)).toBe(
      false,
    );
    expect(authorizationMaterialFailureRequiresLocalErasure("service_unavailable", true)).toBe(
      true,
    );
  });

  it.each(["authentication_failed", "token_envelope_invalid", "key_destroyed"])(
    "allows local erasure for permanently unreadable %s material",
    (failureCategory) => {
      expect(authorizationMaterialFailureRequiresLocalErasure(failureCategory, false)).toBe(true);
    },
  );
});
