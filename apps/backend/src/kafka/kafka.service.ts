import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Consumer, Kafka, logLevel, Producer } from "kafkajs";

/** Domain event topics on the bus. */
export const TOPIC_PAYMENTS = "bharatchain.payments";

/**
 * Thin wrapper over the Kafka (KRaft) event bus. Producing and consuming are
 * best-effort: if the broker is unreachable or `KAFKA_ENABLED=false`, the app
 * runs normally without the bus (mirrors the simulated-email pattern), so the
 * $0/no-infra demo never hard-fails on Kafka.
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private readonly consumers: Consumer[] = [];
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>("KAFKA_ENABLED", "true") === "false") {
      this.logger.log("Kafka disabled (KAFKA_ENABLED=false)");
      return;
    }
    const brokers = this.config.get<string>("KAFKA_BROKERS", "localhost:9092").split(",");
    this.kafka = new Kafka({
      clientId: this.config.get<string>("KAFKA_CLIENT_ID", "bharatchain"),
      brokers,
      retry: { retries: 3, initialRetryTime: 300 },
      logLevel: logLevel.ERROR,
    });
    try {
      // Ensure topics exist before any consumer subscribes (auto-create only fires
      // on first produce, which would race the consumer's startup subscribe).
      const admin = this.kafka.admin();
      await admin.connect();
      await admin.createTopics({
        waitForLeaders: true,
        topics: [{ topic: TOPIC_PAYMENTS, numPartitions: 1 }],
      });
      await admin.disconnect();

      this.producer = this.kafka.producer();
      await this.producer.connect();
      this.ready = true;
      this.logger.log(`Kafka connected (${brokers.join(",")})`);
    } catch (err) {
      this.ready = false;
      this.logger.warn(`Kafka unavailable — events disabled: ${(err as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.ready;
  }

  /** Publish a JSON event. No-op if the bus is unavailable. */
  async emit(topic: string, key: string, value: Record<string, unknown>): Promise<void> {
    if (!this.ready || !this.producer) return;
    try {
      await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
    } catch (err) {
      this.logger.warn(`Kafka emit to ${topic} failed: ${(err as Error).message}`);
    }
  }

  /** Subscribe a handler to a topic. No-op if the bus is unavailable. */
  async consume(
    topic: string,
    groupId: string,
    handler: (event: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (!this.kafka) return;
    try {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topic, fromBeginning: false });
      await consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) return;
          try {
            await handler(JSON.parse(message.value.toString()) as Record<string, unknown>);
          } catch (err) {
            this.logger.warn(`Handler error on ${topic}: ${(err as Error).message}`);
          }
        },
      });
      this.consumers.push(consumer);
      this.logger.log(`Kafka consumer running: topic=${topic} group=${groupId}`);
    } catch (err) {
      this.logger.warn(`Kafka consumer for ${topic} failed: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const c of this.consumers) {
      try {
        await c.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.producer) {
      try {
        await this.producer.disconnect();
      } catch {
        /* ignore */
      }
    }
  }
}
