import { randomUUID } from "node:crypto";

import { parseAppConfig, runResilientPollingLoop } from "@jingtang/application";
import {
  claimNextOutboxForDispatch,
  completeOutboxDispatch,
  createDatabaseClient,
  releaseOutboxDispatch,
} from "@jingtang/db";
import { loadRuntimeSecretBundle, RabbitCommandPublisher } from "@jingtang/integrations";
import { safeLog } from "@jingtang/observability";

await loadRuntimeSecretBundle(process.env, "dispatcher");
const config = parseAppConfig(process.env);
if (config.ASYNC_TRANSPORT !== "tdmq_rabbitmq" || !config.TDMQ_AMQP_URL) {
  throw new Error("dispatcher_tdmq_configuration_required");
}
if (!config.DATABASE_WORKER_URL) throw new Error("dispatcher_database_url_required");

const dispatcherId = `outbox-dispatcher:${process.pid}:${randomUUID()}`;
const db = createDatabaseClient(config.DATABASE_WORKER_URL);
const publisher = new RabbitCommandPublisher({
  url: config.TDMQ_AMQP_URL,
  exchange: config.TDMQ_EXCHANGE,
  queue: config.TDMQ_QUEUE,
  deadLetterExchange: config.TDMQ_DEAD_LETTER_EXCHANGE,
  deadLetterQueue: config.TDMQ_DEAD_LETTER_QUEUE,
});
let stopping = false;

async function wait(durationMs: number): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (!stopping && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(500, deadline - Date.now())));
  }
}

async function dispatchNext(): Promise<boolean> {
  const message = await claimNextOutboxForDispatch(db, dispatcherId);
  if (!message) return false;
  try {
    await publisher.publish({
      version: 1,
      outboxMessageId: message.id,
      workspaceId: message.workspaceId,
      platformExecutionId: message.platformExecutionId,
      topic: message.topic,
    });
    await completeOutboxDispatch(db, {
      id: message.id,
      dispatchOwner: message.dispatchOwner,
      dispatchGeneration: message.dispatchGeneration,
    });
  } catch (error) {
    await releaseOutboxDispatch(db, {
      id: message.id,
      dispatchOwner: message.dispatchOwner,
      dispatchGeneration: message.dispatchGeneration,
      retryAfterSeconds: 5,
      failureCategory: "tdmq_publish_failed",
    }).catch(() => undefined);
    throw error;
  }
  return true;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    safeLog("info", "dispatcher.shutdown", { reason: signal });
  });
}

async function main(): Promise<void> {
  safeLog("info", "dispatcher.ready", { dispatcherId, transport: "tdmq_rabbitmq" });
  try {
    await runResilientPollingLoop({
      shouldStop: () => stopping,
      operation: dispatchNext,
      waitWhenIdle: () => wait(500),
      waitAfterFailure: () => wait(5_000),
      onError: () => safeLog("error", "dispatcher.iteration_failed", {}),
    });
  } finally {
    await publisher.close();
    await db.$disconnect();
  }
}

if (process.env.NODE_ENV !== "test") {
  void main().catch(() => {
    process.exitCode = 1;
  });
}
