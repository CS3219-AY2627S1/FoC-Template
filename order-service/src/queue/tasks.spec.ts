/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 e (instructions.md) - unit tests for notifySeriesEvent and
 *        isChatNotificationPayload (the extended chat_notification payload: nullable
 *        orderId + recipient). No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 */

import {
  CHAT_NOTIFICATION_TASK,
  isChatNotificationPayload,
  notifySeriesEvent,
} from './tasks.js';

describe('notifySeriesEvent', () => {
  it('builds a chat_notification task with orderId null and the recipient set', () => {
    const task = notifySeriesEvent({
      userId: 'user-1',
      messageId: 'msg-1',
      message: 'hello',
    });
    expect(task).toEqual({
      taskName: CHAT_NOTIFICATION_TASK,
      payload: { orderId: null, recipient: 'user-1', messageId: 'msg-1', message: 'hello' },
    });
  });
});

describe('isChatNotificationPayload', () => {
  it('accepts an order-scoped payload (orderId string, no recipient)', () => {
    expect(
      isChatNotificationPayload({ orderId: 'o-1', messageId: 'm-1', message: 'hi' }),
    ).toBe(true);
  });

  it('accepts a series notice (orderId null, recipient string)', () => {
    expect(
      isChatNotificationPayload({
        orderId: null,
        recipient: 'u-1',
        messageId: 'm-1',
        message: 'hi',
      }),
    ).toBe(true);
  });

  it('rejects orderId null with no recipient', () => {
    expect(
      isChatNotificationPayload({ orderId: null, messageId: 'm-1', message: 'hi' }),
    ).toBe(false);
  });

  it.each([null, undefined, 123, {}])('rejects %p', (input) => {
    expect(isChatNotificationPayload(input)).toBe(false);
  });

  it('rejects a non-string messageId or message', () => {
    expect(
      isChatNotificationPayload({ orderId: 'o-1', messageId: 1, message: 'hi' }),
    ).toBe(false);
    expect(
      isChatNotificationPayload({ orderId: 'o-1', messageId: 'm-1', message: 1 }),
    ).toBe(false);
  });
});
