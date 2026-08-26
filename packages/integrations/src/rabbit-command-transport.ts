import { connect, type Channel, type ChannelModel, type ConfirmChannel } from "amqplib";

export interface PublishCommandMessage {
  readonly version: 1;
  readonly outboxMessageId: string;
  readonly workspaceId: string;
  readonly platformExecutionId: string;
  readonly topic: string;
}

export type CommandDisposition = "ack" | "retry" | "dead";

interface RabbitTopology {
  readonly url: string;
  readonly exchange: string;
  readonly queue: string;
  readonly deadLetterExchange: string;
  readonly deadLetterQueue: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const tdmqDeadLetterTtlMs = 14 * 24 * 60 * 60 * 1_000;

export function parsePublishCommandMessage(value: Buffer): PublishCommandMessage {
  let input: Partial<PublishCommandMessage>;
  try {
    input = JSON.parse(value.toString("utf8")) as Partial<PublishCommandMessage>;
  } catch {
    throw new Error("invalid_tdmq_command");
  }
  if (
    input.version !== 1 ||
    typeof input.outboxMessageId !== "string" ||
    !uuidPattern.test(input.outboxMessageId) ||
    typeof input.workspaceId !== "string" ||
    !uuidPattern.test(input.workspaceId) ||
    typeof input.platformExecutionId !== "string" ||
    !uuidPattern.test(input.platformExecutionId) ||
    (input.topic !== "platform.youtube.publish.v1" &&
      input.topic !== "platform.facebook.publish.v1")
  ) {
    throw new Error("invalid_tdmq_command");
  }
  return input as PublishCommandMessage;
}

async function assertTopology(channel: Channel, topology: RabbitTopology): Promise<void> {
  await channel.assertExchange(topology.exchange, "topic", { durable: true });
  await channel.assertExchange(topology.deadLetterExchange, "topic", { durable: true });
  await channel.assertQueue(topology.deadLetterQueue, {
    durable: true,
    arguments: { "x-message-ttl": tdmqDeadLetterTtlMs },
  });
  await channel.bindQueue(topology.deadLetterQueue, topology.deadLetterExchange, "#");
  await channel.assertQueue(topology.queue, {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": topology.deadLetterExchange,
    },
  });
  await channel.bindQueue(topology.queue, topology.exchange, "platform.youtube.publish.v1");
  await channel.bindQueue(topology.queue, topology.exchange, "platform.facebook.publish.v1");
}

export class RabbitCommandPublisher {
  readonly #topology: RabbitTopology;
  #connection: ChannelModel | undefined;
  #channel: ConfirmChannel | undefined;

  constructor(topology: RabbitTopology) {
    this.#topology = topology;
  }

  async #ready(): Promise<ConfirmChannel> {
    if (this.#channel) return this.#channel;
    this.#connection = await connect(this.#topology.url, {
      timeout: 10_000,
      clientProperties: { connection_name: "jingtang-dispatcher" },
    });
    this.#channel = await this.#connection.createConfirmChannel();
    this.#channel.once("close", () => {
      this.#channel = undefined;
      this.#connection = undefined;
    });
    await assertTopology(this.#channel, this.#topology);
    return this.#channel;
  }

  async publish(message: PublishCommandMessage): Promise<void> {
    const channel = await this.#ready();
    let returned = false;
    const handleReturn = (delivery: { properties: { messageId?: string } }) => {
      if (delivery.properties.messageId === message.outboxMessageId) returned = true;
    };
    channel.on("return", handleReturn);
    channel.publish(
      this.#topology.exchange,
      message.topic,
      Buffer.from(JSON.stringify(message), "utf8"),
      {
        persistent: true,
        mandatory: true,
        contentType: "application/json",
        contentEncoding: "utf-8",
        type: message.topic,
        messageId: message.outboxMessageId,
        timestamp: Date.now(),
      },
    );
    try {
      await channel.waitForConfirms();
      if (returned) throw new Error("tdmq_message_unroutable");
    } finally {
      channel.off("return", handleReturn);
    }
  }

  async close(): Promise<void> {
    await this.#channel?.close().catch(() => undefined);
    await this.#connection?.close().catch(() => undefined);
    this.#channel = undefined;
    this.#connection = undefined;
  }
}

export class RabbitCommandConsumer {
  readonly #topology: RabbitTopology;
  #connection: ChannelModel | undefined;
  #channel: Channel | undefined;
  #closing = false;
  #closeNotified = false;

  constructor(topology: RabbitTopology) {
    this.#topology = topology;
  }

  async start(
    handler: (message: PublishCommandMessage) => Promise<CommandDisposition>,
    onUnexpectedClose?: () => void,
  ): Promise<void> {
    this.#closing = false;
    this.#closeNotified = false;
    const handleClose = () => {
      this.#channel = undefined;
      this.#connection = undefined;
      if (!this.#closing && !this.#closeNotified) {
        this.#closeNotified = true;
        onUnexpectedClose?.();
      }
    };
    try {
      this.#connection = await connect(this.#topology.url, {
        timeout: 10_000,
        clientProperties: { connection_name: "jingtang-worker" },
      });
      this.#connection.once("close", handleClose);
      this.#channel = await this.#connection.createChannel();
      this.#channel.once("close", handleClose);
      await assertTopology(this.#channel, this.#topology);
      await this.#channel.prefetch(1);
      await this.#channel.consume(this.#topology.queue, (delivery) => {
        if (!delivery || !this.#channel) return;
        void (async () => {
          let parsed: PublishCommandMessage;
          try {
            parsed = parsePublishCommandMessage(delivery.content);
          } catch {
            this.#channel?.nack(delivery, false, false);
            return;
          }
          try {
            const disposition = await handler(parsed);
            if (disposition === "ack") this.#channel?.ack(delivery);
            else if (disposition === "dead") this.#channel?.nack(delivery, false, false);
            else setTimeout(() => this.#channel?.nack(delivery, false, true), 1_000);
          } catch {
            setTimeout(() => this.#channel?.nack(delivery, false, true), 1_000);
          }
        })();
      });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async close(): Promise<void> {
    this.#closing = true;
    await this.#channel?.close().catch(() => undefined);
    await this.#connection?.close().catch(() => undefined);
    this.#channel = undefined;
    this.#connection = undefined;
  }
}
