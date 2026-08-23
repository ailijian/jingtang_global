export async function runResilientPollingLoop(input: {
  readonly shouldStop: () => boolean;
  readonly operation: () => Promise<boolean>;
  readonly waitWhenIdle: () => Promise<void>;
  readonly waitAfterFailure: () => Promise<void>;
  readonly onError: (error: unknown) => void;
}): Promise<void> {
  while (!input.shouldStop()) {
    try {
      const worked = await input.operation();
      if (!worked) await input.waitWhenIdle();
    } catch (error) {
      input.onError(error);
      if (!input.shouldStop()) await input.waitAfterFailure();
    }
  }
}
