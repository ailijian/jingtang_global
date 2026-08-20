import { safeLog } from "@jingtang/observability";

safeLog("info", "worker.foundation.ready", {
  stage: "D2",
  externalExecutionEnabled: false,
});

if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => undefined, 60_000);
  process.on("SIGTERM", () => {
    clearInterval(timer);
    safeLog("info", "worker.shutdown", { reason: "SIGTERM" });
    process.exit(0);
  });
}
