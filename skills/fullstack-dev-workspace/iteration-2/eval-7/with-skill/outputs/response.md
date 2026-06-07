The user wants a notification system design with specific patterns: outbox pattern, idempotent consumers, and DLQ. Let me follow the fullstack-dev skill workflow.

Step 0: Gather Requirements - I can infer from the prompt:
- Stack: Not specified, I'll use TypeScript/Node.js as primary with SQL (PostgreSQL)
- Service type: Microservice (notification service consuming events from other services)
- Database: PostgreSQL (needed for transactional outbox)
- Integration: REST + event-driven (outbox pattern)
- Real-time: SSE for in-app alerts likely
- Auth: Not the focus here

Step 1: Make Architectural Decisions
Step 2: Scaffold with Checklist
Step 3: Implement Following Patterns
Step 4: Verify
Step 5: Handoff Summary

Let me design this comprehensively.
I read this as designing a notification system with event versioning, transactional outbox, idempotent consumers, and DLQ — all core infrastructure patterns, not a UI task.

## Architectural Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Project structure | Feature-first | Notification is a bounded context with clear sub-features |
| Database | PostgreSQL | Transactional outbox requires same-DB transaction — NoSQL can't do this |
| Event delivery | Polling outbox → process → mark sent | Simpler than CDC (Debezium) for most SaaS; upgrade to CDC later |
| Idempotency | Composite key `(consumer_id, event_id)` on delivery tracking table | Guarantees exactly-once processing per consumer |
| DLQ | Same DB, separate table with retry metadata | Keeps everything transactional; no external queue dependency |
| Error handling | Typed error hierarchy | Per Core Principle #5 |
| Language | TypeScript/Node.js | Most common SaaS stack; patterns are portable |

---

## 1. Event Schema with Versioning

Events carry a version so consumers can evolve independently. The schema is the contract between producers and the notification service.

```typescript
// notification/shared/events/event.types.ts

export type EventVersion = `${number}.${number}.${number}`; // semver

export interface CloudEvent<T = unknown> {
  /** RFC 4122 UUID — globally unique, used as idempotency key */
  id: string;
  /** Reverse-DNS event type: com.saas.user.signup */
  type: string;
  /** Schema version of this event type */
  version: EventVersion;
  /** ISO 8601 timestamp — when the event occurred in the source system */
  timestamp: string;
  /** Source service that produced the event */
  source: string;
  /** Event payload — shape depends on type + version */
  data: T;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

// ── Domain event types ──────────────────────────────────────────

export namespace UserEvents {
  export const SIGNUP = 'com.saas.user.signup' as const;
  export interface V1Data {
    userId: string;
    email: string;
    name: string;
    signupMethod: 'email' | 'google' | 'github';
  }
}

export namespace OrderEvents {
  export const PLACED = 'com.saas.order.placed' as const;
  export interface V1Data {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number; priceCents: number }>;
    totalCents: number;
    currency: string;
  }
  // V2 adds shipping address — consumers that only know V1 still work
  export interface V2Data extends V1Data {
    shippingAddress: {
      line1: string; city: string; state: string; zip: string; country: string;
    };
  }
}

export namespace PaymentEvents {
  export const RECEIVED = 'com.saas.payment.received' as const;
  export interface V1Data {
    paymentId: string;
    orderId: string;
    userId: string;
    amountCents: number;
    currency: string;
    method: 'card' | 'bank_transfer' | 'crypto';
  }
}

export namespace InvoiceEvents {
  export const GENERATED = 'com.saas.invoice.generated' as const;
  export interface V1Data {
    invoiceId: string;
    orderId: string;
    userId: string;
    pdfUrl: string;
    amountCents: number;
    currency: string;
    dueDate: string;
  }
}

// ── Versioned event type map (for type-safe dispatch) ───────────

export type EventTypeMap = {
  [UserEvents.SIGNUP]: { '1.0.0': UserEvents.V1Data };
  [OrderEvents.PLACED]: { '1.0.0': OrderEvents.V1Data; '2.0.0': OrderEvents.V2Data };
  [PaymentEvents.RECEIVED]: { '1.0.0': PaymentEvents.V1Data };
  [InvoiceEvents.GENERATED]: { '1.0.0': InvoiceEvents.V1Data };
};
```

### Versioning Rules

```
✅ Consumers MUST handle unknown versions gracefully (log + skip or forward-compatible default)
✅ New versions MUST be backward-compatible OR consumers MUST be updated before producers
✅ Version is part of the event type identity — changing version is a contract change
✅ Use semver: patch = no schema change, minor = additive fields, major = breaking change
❌ Never mutate event schema in-place — always add a new version
```

---

## 2. Outbox Pattern — Same DB Transaction

The outbox pattern guarantees that an event is published if and only if the business write succeeds. Both happen in the same PostgreSQL transaction.

### Database Schema

```sql
-- notification/migrations/001_outbox.sql

CREATE TABLE outbox (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL UNIQUE,              -- matches CloudEvent.id
  event_type    VARCHAR(255) NOT NULL,             -- e.g. 'com.saas.order.placed'
  event_version VARCHAR(20)    NOT NULL DEFAULT '1.0.0',
  aggregate_type VARCHAR(100) NOT NULL,             -- e.g. 'order'
  aggregate_id  VARCHAR(255) NOT NULL,              -- e.g. order ID
  payload       JSONB          NOT NULL,
  metadata      JSONB          DEFAULT '{}',        -- correlationId, traceId, etc.
  status        VARCHAR(20)    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'published', 'failed')),
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ    NOT NULL DEFAULT now()  -- for delayed events
);

-- Poller picks up pending events, ordered by creation time
CREATE INDEX idx_outbox_pending ON outbox (created_at)
  WHERE status = 'pending';

-- Prevent duplicate event_id (idempotency at the producer level)
CREATE UNIQUE INDEX idx_outbox_event_id ON outbox (event_id);

-- For monitoring: how many events are stuck?
CREATE INDEX idx_outbox_status ON outbox (status) WHERE status IN ('pending', 'failed');
```

### Outbox Writer (in the Producer Service)

```typescript
// notification/outbox/outbox.writer.ts

import { Pool } from 'pg';
import { v4 as uuid } from 'uuid';
import type { CloudEvent } from '../shared/events/event.types';

export class OutboxWriter {
  constructor(private readonly pool: Pool) {}

  /**
   * Call this INSIDE the same transaction as your business write.
   * The caller owns the transaction — this just appends to outbox.
   */
  async append(client: PoolClient, event: CloudEvent): Promise<void> {
    await client.query(`
      INSERT INTO outbox (event_id, event_type, event_version, aggregate_type, aggregate_id, payload, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      event.id,
      event.type,
      event.version,
      event.type.split('.').pop()!,           // 'signup' from 'com.saas.user.signup'
      this.extractAggregateId(event),          // depends on event type
      JSON.stringify(event.data),
      JSON.stringify({ correlationId: event.correlationId, source: event.source }),
    ]);
  }

  private extractAggregateId(event: CloudEvent): string {
    const data = event.data as Record<string, unknown>;
    // Convention: data contains {entityType}Id as top-level field
    const idField = Object.keys(data).find(k => k.endsWith('Id'));
    if (!idField) throw new Error(`Cannot determine aggregate ID for event ${event.type}`);
    return String(data[idField]);
  }
}
```

### Example: Order Service Writes Business Data + Outbox in One Transaction

```typescript
// order/order.service.ts

export class OrderService {
  constructor(
    private readonly pool: Pool,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Business write
      const result = await client.query(`
        INSERT INTO orders (id, user_id, total_cents, currency, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING *
      `, [uuid(), input.userId, input.totalCents, input.currency]);

      const order = result.rows[0];

      // 2. Outbox write — SAME transaction
      await this.outboxWriter.append(client, {
        id: uuid(),
        type: 'com.saas.order.placed',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        source: 'order-service',
        correlationId: input.correlationId,
        data: {
          orderId: order.id,
          userId: order.user_id,
          items: input.items,
          totalCents: order.total_cents,
          currency: order.currency,
          shippingAddress: input.shippingAddress,
        },
      });

      await client.query('COMMIT');
      return order;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;   // typed error handler catches this
    } finally {
      client.release();
    }
  }
}
```

### Outbox Poller (Notification Service)

```typescript
// notification/outbox/outbox.poller.ts

export class OutboxPoller {
  private readonly BATCH_SIZE = 50;
  private readonly POLL_INTERVAL_MS = 1000;  // 1 second

  constructor(
    private readonly pool: Pool,
    private readonly dispatcher: NotificationDispatcher,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.logger.info('Outbox poller started');
    const timer = setInterval(() => this.poll(), this.POLL_INTERVAL_MS);
    // Graceful shutdown clears the interval
    process.on('SIGTERM', () => {
      clearInterval(timer);
      this.logger.info('Outbox poller stopped');
    });
  }

  private async poll(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Skip-locked: if another worker is processing a row, skip it (parallel safety)
      const { rows } = await client.query(`
        SELECT id, event_id, event_type, event_version, payload, metadata
        FROM outbox
        WHERE status = 'pending' AND scheduled_for <= now()
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [this.BATCH_SIZE]);

      if (rows.length === 0) return;

      for (const row of rows) {
        await this.processEvent(client, row);
      }
    } catch (err) {
      this.logger.error('Outbox poll error', { error: String(err) });
    } finally {
      client.release();
    }
  }

  private async processEvent(client: PoolClient, row: OutboxRow): Promise<void> {
    try {
      await this.dispatcher.dispatch({
        id: row.event_id,
        type: row.event_type,
        version: row.event_version,
        timestamp: row.metadata?.correlationId ? row.created_at : new Date().toISOString(),
        source: row.metadata?.source || 'unknown',
        data: row.payload,
        correlationId: row.metadata?.correlationId,
      });

      // Mark published — removes from poll set
      await client.query(`
        UPDATE outbox SET status = 'published', published_at = now() WHERE id = $1
      `, [row.id]);

      this.logger.info('Event published', { eventId: row.event_id, eventType: row.event_type });
    } catch (err) {
      // Mark failed — DLQ processor will pick it up
      await client.query(`
        UPDATE outbox SET status = 'failed' WHERE id = $1
      `, [row.id]);

      this.logger.error('Event dispatch failed', {
        eventId: row.event_id, error: String(err),
      });
    }
  }
}
```

---

## 3. Idempotent Consumer — Delivery Tracking

Every notification channel (email, push, in-app) is a separate consumer. Each tracks what it has processed via a composite idempotency key.

### Database Schema

```sql
-- notification/migrations/002_delivery_tracking.sql

CREATE TABLE notification_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id     VARCHAR(100) NOT NULL,    -- e.g. 'email-sender', 'push-sender', 'in-app-sender'
  event_id        UUID NOT NULL,            -- matches outbox.event_id
  event_type      VARCHAR(255) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'failed', 'skipped')),
  attempts        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,

  -- THE IDEMPOTENCY KEY: one delivery per consumer per event
  UNIQUE (consumer_id, event_id)
);

CREATE INDEX idx_deliveries_pending ON notification_deliveries (created_at)
  WHERE status = 'pending';
```

### Idempotent Consumer Base

```typescript
// notification/consumers/idempotent-consumer.ts

import { Pool } from 'pg';
import { Logger } from '../shared/logger';

export abstract class IdempotentConsumer<TEvent = unknown> {
  constructor(
    protected readonly pool: Pool,
    protected readonly logger: Logger,
  ) {}

  /** Unique identifier for this consumer — used in idempotency key */
  abstract readonly consumerId: string;
  /** Which event types this consumer handles */
  abstract readonly supportedTypes: string[];

  /** Process the event — implemented by each channel */
  protected abstract processEvent(event: CloudEvent<TEvent>): Promise<void>;

  /** Main entry: idempotent dispatch */
  async handle(event: CloudEvent<TEvent>): Promise<void> {
    if (!this.supportedTypes.includes(event.type)) {
      this.logger.debug('Consumer skipping unsupported event type', {
        consumerId: this.consumerId, eventType: event.type,
      });
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // ── Idempotency check: INSERT with ON CONFLICT ──────────
      // If we already processed this (consumer_id, event_id), the INSERT
      // is a no-op and we return immediately.
      const insertResult = await client.query(`
        INSERT INTO notification_deliveries (consumer_id, event_id, event_type, status)
        VALUES ($1, $2, $3, 'pending')
        ON CONFLICT (consumer_id, event_id) DO NOTHING
        RETURNING id, status
      `, [this.consumerId, event.id, event.type]);

      if (insertResult.rowCount === 0) {
        // Already processed — check if it was delivered or failed
        const existing = await client.query(`
          SELECT status FROM notification_deliveries
          WHERE consumer_id = $1 AND event_id = $2
        `, [this.consumerId, event.id]);

        this.logger.info('Duplicate event — skipping', {
          consumerId: this.consumerId, eventId: event.id, status: existing.rows[0]?.status,
        });
        await client.query('COMMIT');
        return;  // idempotent: second delivery = no-op
      }

      // ── Process the event ────────────────────────────────────
      try {
        await this.processEvent(event);

        await client.query(`
          UPDATE notification_deliveries
          SET status = 'delivered', attempts = attempts + 1,
              last_attempt_at = now(), completed_at = now()
          WHERE consumer_id = $1 AND event_id = $2
        `, [this.consumerId, event.id]);

        await client.query('COMMIT');
        this.logger.info('Event delivered', { consumerId: this.consumerId, eventId: event.id });

      } catch (err) {
        // ── Processing failed — mark for retry/DLQ ─────────────
        await client.query(`
          UPDATE notification_deliveries
          SET status = 'failed', attempts = attempts + 1,
              last_attempt_at = now(), last_error = $3
          WHERE consumer_id = $1 AND event_id = $2
        `, [this.consumerId, event.id, String(err)]);

        await client.query('COMMIT');
        throw err;  // re-throw so the poller can route to DLQ
      }
    } catch (err) {
      // Transaction-level error (e.g., connection lost)
      await client.query('ROLLBACK').catch(() => {});  // best-effort rollback
      throw err;
    } finally {
      client.release();
    }
  }
}
```

### Concrete Consumers

```typescript
// notification/consumers/email.consumer.ts

export class EmailConsumer extends IdempotentConsumer<UserEvents.V1Data> {
  readonly consumerId = 'email-sender';
  readonly supportedTypes = [
    'com.saas.user.signup',
    'com.saas.order.placed',
    'com.saas.payment.received',
    'com.saas.invoice.generated',
  ];

  protected async processEvent(event: CloudEvent<UserEvents.V1Data>): Promise<void> {
    switch (event.type) {
      case 'com.saas.user.signup':
        await this.sendWelcomeEmail(event.data);
        break;
      case 'com.saas.order.placed':
        await this.sendOrderConfirmation(event.data);
        break;
      case 'com.saas.payment.received':
        await this.sendPaymentReceipt(event.data);
        break;
      case 'com.saas.invoice.generated':
        await this.sendInvoiceEmail(event.data);
        break;
    }
  }

  private async sendWelcomeEmail(data: UserEvents.V1Data): Promise<void> {
    await this.emailProvider.send({
      to: data.email,
      template: 'welcome',
      context: { name: data.name },
    });
  }
  // ... other email methods
}
```

```typescript
// notification/consumers/push.consumer.ts

export class PushConsumer extends IdempotentConsumer<unknown> {
  readonly consumerId = 'push-sender';
  readonly supportedTypes = [
    'com.saas.order.placed',
    'com.saas.payment.received',
  ];

  protected async processEvent(event: CloudEvent<unknown>): Promise<void> {
    await this.pushProvider.send({
      userId: (event.data as any).userId,
      title: this.getTitle(event.type),
      body: this.getBody(event.type, event.data),
    });
  }
}
```

```typescript
// notification/consumers/inapp.consumer.ts

export class InAppConsumer extends IdempotentConsumer<unknown> {
  readonly consumerId = 'in-app-sender';
  readonly supportedTypes = [
    'com.saas.user.signup',
    'com.saas.order.placed',
    'com.saas.payment.received',
    'com.saas.invoice.generated',
  ];

  protected async processEvent(event: CloudEvent<unknown>): Promise<void> {
    await this.pool.query(`
      INSERT INTO notifications (id, user_id, type, title, body, event_id, read)
      VALUES ($1, $2, $3, $4, $5, $6, false)
    `, [
      uuid(),
      (event.data as any).userId,
      event.type,
      this.getTitle(event.type),
      this.getBody(event.type, event.data),
      event.id,
    ]);
  }
}
```

---

## 4. Dead Letter Queue with Retry Tracking

Failed deliveries go to a DLQ table with exponential backoff retry scheduling. After max retries, they're flagged for manual intervention.

### Database Schema

```sql
-- notification/migrations/003_dlq.sql

CREATE TABLE dead_letter_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id     VARCHAR(100) NOT NULL,
  event_id        UUID NOT NULL,
  event_type      VARCHAR(255) NOT NULL,
  payload         JSONB NOT NULL,
  metadata        JSONB DEFAULT '{}',

  -- Retry tracking
  retry_count     INT NOT NULL DEFAULT 0,
  max_retries     INT NOT NULL DEFAULT 3,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  last_attempt_at TIMESTAMPTZ,

  -- Final state
  status          VARCHAR(20) NOT NULL DEFAULT 'retryable'
                  CHECK (status IN ('retryable', 'permanently_failed', 'resolved')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     VARCHAR(100),  -- who resolved it (admin email, etc.)
  resolution_note TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DLQ processor picks up retryable entries whose next_retry_at has passed
CREATE INDEX idx_dlq_retryable ON dead_letter_queue (next_retry_at)
  WHERE status = 'retryable';

-- Admin dashboard: show permanently failed items
CREATE INDEX idx_dlq_permanent ON dead_letter_queue (created_at)
  WHERE status = 'permanently_failed';
```

### DLQ Processor

```typescript
// notification/dlq/dlq.processor.ts

import { Pool } from 'pg';
import { Logger } from '../shared/logger';

const BACKOFF_BASE_MS = 1000;       // 1 second
const BACKOFF_MAX_MS = 60_000;      // 1 minute cap
const DEFAULT_MAX_RETRIES = 3;

export class DLQProcessor {
  private readonly BATCH_SIZE = 20;

  constructor(
    private readonly pool: Pool,
    private readonly dispatcher: NotificationDispatcher,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.logger.info('DLQ processor started');
    const timer = setInterval(() => this.process(), 5000);  // every 5 seconds
    process.on('SIGTERM', () => {
      clearInterval(timer);
      this.logger.info('DLQ processor stopped');
    });
  }

  private async process(): Promise<void> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query(`
        SELECT id, consumer_id, event_id, event_type, payload, metadata,
               retry_count, max_retries, last_error
        FROM dead_letter_queue
        WHERE status = 'retryable' AND next_retry_at <= now()
        ORDER BY next_retry_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `, [this.BATCH_SIZE]);

      for (const row of rows) {
        await this.retryEvent(client, row);
      }
    } catch (err) {
      this.logger.error('DLQ process error', { error: String(err) });
    } finally {
      client.release();
    }
  }

  private async retryEvent(client: PoolClient, entry: DLQEntry): Promise<void> {
    const event: CloudEvent = {
      id: entry.event_id,
      type: entry.event_type,
      version: entry.metadata?.version || '1.0.0',
      timestamp: entry.metadata?.timestamp || new Date().toISOString(),
      source: entry.metadata?.source || 'dlq-retry',
      data: entry.payload,
      correlationId: entry.metadata?.correlationId,
    };

    try {
      await this.dispatcher.dispatch(event);

      // Success — mark resolved
      await client.query(`
        UPDATE dead_letter_queue
        SET status = 'resolved', resolved_at = now(), resolved_by = 'dlq-processor',
            retry_count = $1, last_attempt_at = now()
        WHERE id = $2
      `, [entry.retry_count + 1, entry.id]);

      this.logger.info('DLQ event resolved on retry', {
        eventId: entry.event_id, consumerId: entry.consumer_id,
        retryCount: entry.retry_count + 1,
      });

    } catch (err) {
      const newRetryCount = entry.retry_count + 1;
      const isPermanent = newRetryCount >= entry.max_retries;

      if (isPermanent) {
        // Max retries exceeded — permanently failed, needs human intervention
        await client.query(`
          UPDATE dead_letter_queue
          SET status = 'permanently_failed', retry_count = $1,
              last_error = $2, last_attempt_at = now()
          WHERE id = $3
        `, [newRetryCount, String(err), entry.id]);

        this.logger.error('DLQ event permanently failed', {
          eventId: entry.event_id, consumerId: entry.consumer_id,
          retryCount: newRetryCount, error: String(err),
        });

        // Alert ops team
        await this.alertPermanentFailure(entry, err);

      } else {
        // Schedule retry with exponential backoff
        const backoffMs = Math.min(
          BACKOFF_BASE_MS * Math.pow(2, newRetryCount),  // 2s, 4s, 8s...
          BACKOFF_MAX_MS,
        );

        await client.query(`
          UPDATE dead_letter_queue
          SET retry_count = $1, next_retry_at = now() + interval '${backoffMs} milliseconds',
              last_error = $2, last_attempt_at = now()
          WHERE id = $3
        `, [newRetryCount, String(err), entry.id]);

        this.logger.warn('DLQ event retry scheduled', {
          eventId: entry.event_id, consumerId: entry.consumer_id,
          retryCount: newRetryCount, nextRetryIn: `${backoffMs}ms`,
        });
      }
    }
  }

  private async alertPermanentFailure(entry: DLQEntry, err: unknown): Promise<void> {
    // Integrate with PagerDuty, Slack, OpsGenie, etc.
    this.logger.error('ALERT: Notification permanently failed — requires manual intervention', {
      eventId: entry.event_id, eventType: entry.event_type,
      consumerId: entry.consumer_id, retryCount: entry.max_retries,
      lastError: String(err),
    });
  }
}
```

### Moving Failed Deliveries to DLQ

The dispatcher catches failures and moves them to the DLQ:

```typescript
// notification/dispatcher.ts

export class NotificationDispatcher {
  constructor(
    private readonly consumers: IdempotentConsumer[],
    private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  async dispatch(event: CloudEvent): Promise<void> {
    const results = await Promise.allSettled(
      this.consumers.map(consumer => consumer.handle(event)),
    );

    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const consumer = this.consumers[i];
        const error = results[i].reason;

        // Move to DLQ for retry
        await this.moveToDLQ(consumer.consumerId, event, error);
      }
    }
  }

  private async moveToDLQ(
    consumerId: string, event: CloudEvent, error: unknown,
  ): Promise<void> {
    await this.pool.query(`
      INSERT INTO dead_letter_queue (consumer_id, event_id, event_type, payload, metadata, last_error)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING
    `, [
      consumerId,
      event.id,
      event.type,
      JSON.stringify(event.data),
      JSON.stringify({ version: event.version, source: event.source, correlationId: event.correlationId }),
      String(error),
    ]);

    this.logger.warn('Event moved to DLQ', { consumerId, eventId: event.id });
  }
}
```

---

## 5. Wiring It All Together

```typescript
// notification/server.ts

import { Pool } from 'pg';
import { OutboxPoller } from './outbox/outbox.poller';
import { DLQProcessor } from './dlq/dlq.processor';
import { NotificationDispatcher } from './dispatcher';
import { EmailConsumer } from './consumers/email.consumer';
import { PushConsumer } from './consumers/push.consumer';
import { InAppConsumer } from './consumers/inapp.consumer';
import { logger } from './shared/logger';

const pool = new Pool({
  connectionString: config.database.url,
  max: config.database.poolSize,
});

const consumers: IdempotentConsumer[] = [
  new EmailConsumer(pool, logger),
  new PushConsumer(pool, logger),
  new InAppConsumer(pool, logger),
];

const dispatcher = new NotificationDispatcher(consumers, pool, logger);
const poller = new OutboxPoller(pool, dispatcher, logger);
const dlqProcessor = new DLQProcessor(pool, dispatcher, logger);

// Start processors
poller.start();
dlqProcessor.start();

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', checks: { database: 'ok' } });
  } catch {
    res.status(503).json({ status: 'degraded', checks: { database: 'error' } });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down');
  // Poller and DLQ processor clear their own intervals on SIGTERM
  await pool.end();
  process.exit(0);
});
```

---

## Data Flow Summary

```
Producer Service                    Notification Service
─────────────────                   ─────────────────────
1. BEGIN transaction
2. INSERT business data
3. INSERT into outbox ──────────►   4. Poller picks up (FOR UPDATE SKIP LOCKED)
4. COMMIT                            5. Dispatcher fans out to consumers
                                      6. Each consumer:
                                         a. INSERT delivery row (idempotency key)
                                         b. ON CONFLICT → skip (already processed)
                                         c. Process (send email/push/in-app)
                                         d. Mark delivered
                                      7. On failure:
                                         a. Mark delivery failed
                                         b. Move to DLQ
                                         c. DLQ processor retries with backoff
                                         d. After max retries → permanently_failed
                                            → alert ops team
```

## Key Files

| File | Purpose |
|------|---------|
| `shared/events/event.types.ts` | Versioned event schema and type map |
| `outbox/outbox.writer.ts` | Appends events to outbox within producer transaction |
| `order/order.service.ts` | Example: business write + outbox in one transaction |
| `outbox/outbox.poller.ts` | Polls pending events, dispatches to consumers |
| `consumers/idempotent-consumer.ts` | Base class with `(consumer_id, event_id)` idempotency |
| `consumers/email.consumer.ts` | Email channel consumer |
| `consumers/push.consumer.ts` | Push notification consumer |
| `consumers/inapp.consumer.ts` | In-app notification consumer |
| `dlq/dlq.processor.ts` | Retries failed events with exponential backoff |
| `dispatcher.ts` | Fans out events to all consumers, catches failures → DLQ |
| `migrations/001_outbox.sql` | Outbox table schema |
| `migrations/002_delivery_tracking.sql` | Idempotency key table |
| `migrations/003_dlq.sql` | Dead letter queue table |

## What's Missing / Next Steps

- **CDC alternative**: For high throughput, replace polling with Debezium CDC streaming from PostgreSQL WAL
- **Event schema registry**: Add a registry service that validates event payloads against versioned schemas before dispatch
- **Admin dashboard**: Build a UI for viewing/resolving permanently failed DLQ entries
- **Metrics**: Add Prometheus counters for `outbox_pending_total`, `delivery_latency_seconds`, `dlq_retry_count`
- **SSE endpoint**: Add a `/api/notifications/stream` SSE endpoint for real-time in-app notifications (see Section 9 of the skill)
- **Rate limiting**: Per-user notification rate limits to prevent spam
- **Notification preferences**: Let users opt in/out of specific notification channels per event type
