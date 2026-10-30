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
   * User soft-deleted. Credit snapshots the balance and archives credit history;
   * order archives order history. Both keep the data until `purgeAfter`.
   */
  export const userDeletedSchema = userEventBaseSchema.extend({
    type: z.literal('user.deleted'),
    deletedAt: z.string(),
    /** deletedAt + 4 years, set once by the user service so consumers never compute it themselves. */
    purgeAfter: z.string(),
  });
  
  /** User logged back in within the retention window. Consumers restore archived data. */
  export const userRestoredSchema = userEventBaseSchema.extend({
    type: z.literal('user.restored'),
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
