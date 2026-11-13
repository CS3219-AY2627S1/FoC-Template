/**
 * AI Assistance Disclosure:
 * Tool: Claude (Sonnet 5.5), date: 2026-10-19
 * Scope: Transactional outbox table for reliable RabbitMQ publishing
 * Author review: Reviewed and tested locally
 *
 * Doing both order status change and a RabbitMQ publish directly can fail halfway
 * Instead, the event is written to this table in the SAME database
 * transaction as the status change. The outbox relay then publishes
 * unpublished rows to RabbitMQ and marks them done, retrying until it works.
 */

import { DataTypes, type Model, type Sequelize } from "sequelize";
import type {
  OutboxEventAttributes,
  OutboxEventCreationAttributes,
} from "./types.ts";

export interface OutboxEventInstance
  extends Model<OutboxEventAttributes, OutboxEventCreationAttributes>,
    OutboxEventAttributes {}

export default (sequelize: Sequelize) =>
  sequelize.define<OutboxEventInstance>(
    "outbox_event",
    {
      event_id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4,
      },
      event_type: { type: DataTypes.STRING, allowNull: false },
      // The full event envelope, exactly as it will be published
      payload: { type: DataTypes.JSONB, allowNull: false },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      published_at: { type: DataTypes.DATE },
    },
    {
      tableName: "outbox_events",
      timestamps: false,
      indexes: [
        {
          // Partial index: only the (usually tiny) set still waiting to be sent
          name: "outbox_unpublished_idx",
          fields: ["created_at"],
          where: { published_at: null },
        },
      ],
    }
  );
