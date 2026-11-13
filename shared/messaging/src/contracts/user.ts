// AI Assistance Disclosure: ChatGPT (Codex), 2026-11-02.
// Scope: Align user.deleted with the team-supplied event contract; review pending; see ../../../../order-service/usage-log.md.
// Message producer: user service
// Consumers: credit service, order service

import { z } from 'zod';

const userEventBaseSchema = z.object({
    eventId: z.string(),
    occurredAt: z.string(),
    /** UUID string? */
    userId: z.string(),
  });
  
  /** New user registered. Credit initializes the account using its initial-grant policy. */
  export const userCreatedSchema = userEventBaseSchema.extend({
    type: z.literal('user.created'),
  });
  
  /**
   * User row deleted. Order resolves active orders and scrubs personal details;
   * credit keeps the balance under the old id in case the user returns.
   */
  export const userDeletedSchema = userEventBaseSchema.extend({
    type: z.literal('user.deleted'),
    eventId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    occurredAt: z.iso.datetime({ offset: true }),
    deletedAt: z.iso.datetime({ offset: true }),
  });

  /**
   * Deleted user re-registered within the retention window, with a new id.
   * Sent instead of user.created. Credit moves the old balance to `userId`.
   */
  export const userRestoredSchema = userEventBaseSchema.extend({
    type: z.literal('user.restored'),
    previousUserId: z.string(),
  });
  
  export const userEventSchema = z.discriminatedUnion('type', [
    userCreatedSchema,
    userDeletedSchema,
    userRestoredSchema,
  ]);

  export type UserCreated = z.infer<typeof userCreatedSchema>;
  export type UserDeleted = z.infer<typeof userDeletedSchema>;
  export type UserRestored = z.infer<typeof userRestoredSchema>;
  export type UserEvent = z.infer<typeof userEventSchema>;
