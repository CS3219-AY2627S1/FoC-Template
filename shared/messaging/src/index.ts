import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import amqp, { type ChannelModel, type ConfirmChannel, type ConsumeMessage, type Options } from 'amqplib';
import { QueueLogger } from './queueLog';
import { deadLetterExchange, deadLetterQueue, MAX_RETRIES, RETRY_HEADER } from './topology';
import { NonRetryableError, toError } from './errors';

export type RabbitMQConfig = {
  url?: string;
  queues?: string[];
  serviceName?: string;
  maxRetries?: number;
  /** Directory for broker.log and one file per queue. Default: logs/rabbitmq */
  logDir?: string;
  prefetch: number; //max value of the queue length
};

export type QueueMessage<T = unknown> = {
  eventId: string;
  payload: T;
  retryCount: number; 
};

const DEFAULT_PREFETCH = 10; //default value for prefetch if not specified in service's config
/*
Classic RabbitMQ singleton 

**AI declaration**
AI has suggested the following additions that were accepted by @sunpterodactyl
- Generic queuehandler added in: 
- close() function added in
- uuid for eventId using the event broker it was initially a string
- citation: https://gist.github.com/carlhoerberg/006b01ac17a0a94859ba
- Declaration: wrapping handle delivery registerConsumer was AI suggested, and approved by me 
- This helps with cleaner retry logic and re-registering the consumer to a crashed broker. 

*/

export type QueueHandler<T = unknown> = (message: QueueMessage<T>) => Promise<void>;

type ConsumerRegistration = {
  queue: string;
  register: (channel: ConfirmChannel) => Promise<void>;
};

//Singleton 
export class RabbitMQClient {
  private readonly config: RabbitMQConfig;
  private readonly log: QueueLogger;
  private connection: ChannelModel | undefined;
  private channel: ConfirmChannel | undefined;
  private readonly consumers: ConsumerRegistration[] = [];
  private connectionPromise: Promise<void> | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private reconnectAttempts = 0;
  private closing = false;

  constructor(config: RabbitMQConfig = {prefetch:100}) { 
    this.config = config;
    this.log = new QueueLogger(
      config.logDir ?? path.join(process.cwd(), 'logs', 'rabbitmq'),
      config.serviceName ?? 'rabbitmq',
    );
  }

  // Manages connection and consumer recovery.
  async connect(): Promise<void> {
    this.closing = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    await this.connectOnce();
  }

  private async connectOnce(): Promise<void> {
    if (this.connection && this.channel) return;
    if (this.connectionPromise) return this.connectionPromise;

    const attempt = this.openConnection();
    this.connectionPromise = attempt;
    try {
      await attempt;
    } finally {
      if (this.connectionPromise === attempt) this.connectionPromise = undefined;
    }
  }

  private async openConnection(): Promise<void> {
    const url = this.config.url || 'amqp://guest:guest@localhost:5672';
    const connection = this.connection = await amqp.connect(url);
    
    connection.on("error", (err: Error) => {
        if (err.message !== "Connection closing") {
          this.log.error('connection-error', undefined, { message: err.message });
        }
      });

    connection.on("close", () => {
      if (this.connection !== connection) return;
      this.connection = undefined;
      this.channel = undefined;
      if (!this.closing) {
        this.log.error('connection-closed', undefined, {
          message: 'Reconnecting and restoring consumers',
        });
        this.scheduleReconnect();
      }
      })


    let channel: ConfirmChannel | undefined;
    try {
      channel = this.channel = await connection.createConfirmChannel();
      channel.on('close', () => {
        if (this.channel !== channel) return;
        this.channel = undefined;
        if (this.connection === connection) {
          this.connection = undefined;
          void connection.close().catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            this.log.error('connection-close-failure', undefined, { message });
          });
        }
        if (!this.closing) this.scheduleReconnect();
      });

      for (const queue of this.config.queues ?? []) {
        await this.assertQueueWithDeadLetterOnChannel(channel, queue);
      }
      for (const consumer of this.consumers) {
        await this.assertQueueWithDeadLetterOnChannel(channel, consumer.queue);
        await consumer.register(channel);
      }
      this.reconnectAttempts = 0;
      this.log.info('connected');
    } catch (err) {
      if (this.channel === channel) this.channel = undefined;
      if (this.connection === connection) this.connection = undefined;
      try {
        await channel?.close();
      } catch (closeError) {
        const message = closeError instanceof Error ? closeError.message : String(closeError);
        this.log.error('channel-close-failure', undefined, { message });
      }
      try {
        await connection.close();
      } catch (closeError) {
        const message = closeError instanceof Error ? closeError.message : String(closeError);
        this.log.error('connection-close-failure', undefined, { message });
      }
      throw err;
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const channel = this.channel;
    const connection = this.connection;
    this.channel = undefined;
    this.connection = undefined;
    try {
      await channel?.close();
    } finally {
      await connection?.close();
    }
    this.log.info('closed');
  }

  async publishToQueue(queue: string, message: object, eventId?: string): Promise<boolean> {
    await this.assertQueueWithDeadLetter(queue);

    const id =
      eventId ??
      (typeof (message as { eventId?: unknown }).eventId === 'string'
        ? (message as { eventId: string }).eventId
        : randomUUID());

    const sent = await this.confirmSend(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      messageId: id,
      contentType: 'application/json',
    }); //correctly specifies content type
    this.log.info(sent ? 'published' : 'publish-rejected', queue, { eventId: id });
    return sent;
  }

  async consumeFromQueue<T = unknown>(queue: string, handler: QueueHandler<T>): Promise<boolean> {
    const channel = this.requireChannel();
    await this.assertQueueWithDeadLetter(queue);
    const maxRetries = this.config.maxRetries ?? MAX_RETRIES;
    const registration: ConsumerRegistration = {
      queue,
      register: (consumerChannel) =>
        this.registerConsumer(consumerChannel, queue, handler, maxRetries),
    };
    this.consumers.push(registration);
    try {
      await registration.register(channel);
    } catch (err) {
      this.consumers.splice(this.consumers.indexOf(registration), 1);
      throw err;
    }
    this.log.info('consuming', queue);
    return true;
  }

  async assertQueueWithDeadLetter(queue: string): Promise<void> {
    const channel = this.requireChannel();
    await this.assertQueueWithDeadLetterOnChannel(channel, queue);
  }

  private async assertQueueWithDeadLetterOnChannel(channel: ConfirmChannel, queue: string): Promise<void> {
    const dlx = deadLetterExchange(queue);
    const dlq = deadLetterQueue(queue);

    await channel.assertExchange(dlx, 'direct', { durable: true });
    await channel.assertQueue(dlq, { durable: true });
    await channel.bindQueue(dlq, dlx, queue);
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: dlx,
      deadLetterRoutingKey: queue,
    });
  }

  private scheduleReconnect(): void {
    if (this.closing || this.reconnectTimer) return;

    const delayMs = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.closing) return;
      void this.connectOnce().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error('reconnect-failure', undefined, { message, retryInMs: delayMs });
        this.scheduleReconnect();
      });
    }, delayMs);
  }

  private async registerConsumer<T>(
    channel: ConfirmChannel,
    queue: string,
    handler: QueueHandler<T>,
    maxRetries: number,
  ): Promise<void> {
    await channel.prefetch(this.config.prefetch ?? DEFAULT_PREFETCH);
    await channel.consume(
      queue,
      (msg: ConsumeMessage | null) => {
        this.handleDelivery(queue, msg, handler, maxRetries, channel).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.log.error('delivery-failure', queue, { message });
        });
      },
      { noAck: false },
    );
  }

  /*
  if(!this.channel) {
    //logic
  }

  is repeated across publishToQueue, consumeFromQueue, assertQueueWithDeadLetter
  since this.channel is a field, if it is not defined it falls back to default undefined

  1. This function adds in a clear failure point if a publish/consume action is taken before connect() or after close()
  2. Narrows the type declaration so callers can use it without extra if(! this.channel) checks

  */
  private requireChannel(): ConfirmChannel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not connected');
    }
    return this.channel;
  }

  // Waits for the broker ack. `false` from sendToQueue only means the socket
  // buffer is full; the confirm callback is still the result that matters.
  private confirmSend(queue: string, body: Buffer, options: Options.Publish): Promise<boolean> {
    const channel = this.requireChannel();
    return new Promise((resolve) => {
      try {
        const buffered = channel.sendToQueue(queue, body, options, (err: Error | null) => {
          resolve(!err);
        });
        if (!buffered) {
          this.log.info('publish-blocked', queue, { eventId: options.messageId });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.log.error('publish-rejected', queue, { eventId: options.messageId, message });
        resolve(false);
      }
    });
  }

  /*
  Generic handler abstracted to handle message 
  for consumer

  - Ignore null (consumer cancelled)
  - Parse JSON; on failure, nack(..., requeue: false) → DLQ
  - Call your domain handler
  - Success → ack
  - Failure and retries left → republish with x-retry + 1, then ack the original
  - Failure and retries exhausted → nack without requeue → DLQ
  */

  private async handleDelivery<T>(queue: string, msg: ConsumeMessage | null, handler: QueueHandler<T>, maxRetries: number, channel: ConfirmChannel): Promise<void> {
    
    if (!msg) return;

    const parsedRetry = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
    const retryCount = Number.isFinite(parsedRetry) ? parsedRetry : maxRetries;
    const messageId = msg.properties.messageId ?? '';

    let payload: T; //my data payload
    try {
      payload = JSON.parse(msg.content.toString()) as T;
      if (payload === null) throw new Error('null payload'); //handle null case
    } catch {
      channel.nack(msg, false, false); // Reject without requeueing; route to the configured DLQ.
      this.log.error('dead-letter', [queue, deadLetterQueue(queue)], {
        eventId: messageId,
        reason: 'invalid-json',
      });
      return;
    }

    const eventId =
      messageId ||
      (typeof (payload as { eventId?: unknown }).eventId === 'string'
        ? (payload as { eventId: string }).eventId
        : '');

    let failure: Error | undefined
    try {
      await handler({ eventId, payload, retryCount });
    } catch (err) {
      failure = toError(err);
    }
    if (!failure) {
      channel.ack(msg); // Acknowledge once, after the handler succeeds.
      this.log.info('acked', queue, { eventId, retryCount });
      return;
    }

    //need to make sure that invalid inputs does not clog the queue
    if (failure instanceof NonRetryableError) {
        channel.nack(msg, false, false);
        this.log.error('dead-letter', [queue, deadLetterQueue(queue)], {
        eventId, retryCount, reason: 'non-retryable', message: failure.message,
      });
      return;
    }

    if (retryCount < maxRetries) {
      //recreate the event message here
      const republished = await this.confirmSend(queue, msg.content, {
        persistent: true,
        messageId: msg.properties.messageId,
        contentType: msg.properties.contentType ?? 'application/json',
        headers: { ...msg.properties.headers, [RETRY_HEADER]: retryCount + 1 },
      });
      if (republished) {
        channel.ack(msg); //acknowledge the original message so it does not get retried again
        this.log.info('retry', queue, { eventId, retryCount: retryCount + 1, message: failure.message });
      } else {
        channel.nack(msg, false, true);//requeue the original message so it can be retried again
        this.log.error('retry-blocked', queue, { eventId, retryCount, message: failure.message });
      }
      return;
    }
    channel.nack(msg, false, false);
    this.log.error('dead-letter', [queue, deadLetterQueue(queue)], { eventId, retryCount, message: failure.message });
    
  }
}

export * from './topology';
export { NonRetryableError } from './errors';
export * from './contracts/credit';
export * from './contracts/order';
export * from './contracts/supplier';
export * from './contracts/user';
