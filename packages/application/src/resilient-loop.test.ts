import { describe, expect, it, vi } from "vitest";

import { runResilientPollingLoop } from "./resilient-loop.js";

describe("resilient worker scheduling", () => {
  it("keeps polling after a transient operation failure", async () => {
    let stopped = false;
    const operation = vi
      .fn<() => Promise<boolean>>()
      .mockRejectedValueOnce(new Error("database_unavailable"))
      .mockImplementationOnce(() => {
        stopped = true;
        return Promise.resolve(true);
      });
    const onError = vi.fn();
    const waitAfterFailure = vi.fn(() => Promise.resolve());

    await runResilientPollingLoop({
      shouldStop: () => stopped,
      operation,
      waitWhenIdle: () => Promise.resolve(),
      waitAfterFailure,
      onError,
    });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledOnce();
    expect(waitAfterFailure).toHaveBeenCalledOnce();
  });
});
