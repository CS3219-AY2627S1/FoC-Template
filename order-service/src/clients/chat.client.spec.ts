/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: GPT-6), date: 2026-11-08
 * Scope: Tested the supplied order-to-chat request contract and retry behavior.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Removed the description from system message text per user instruction.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Tested status notification HTTP calls and username fallback.
 * Author review: tng wen xi
 * Scope (2026-11-08, Codex, model: GPT-6): Added tests for order-based participant delivery.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or tested team-specified order chat archiving after final notifications.
 * Author review: tng wen xi
 * Scope (2026-11-10, Codex, model: GPT-6): Implemented or verified user-specified order message actor fields and toast filtering.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */
import { createHttpChatClient } from './chat.client.js';
const input = {
  orderId: '0192f0c4-0000-7000-8000-000000000001',
  requesterId: '0192f0c4-0000-7000-8000-000000000002',
  orderDescription: 'Coffee',
  messageId: '0192f0c4-0000-7000-8000-000000000003',
};
it('creates the conversation before sending the exact system text and stable ID', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: 201 }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  expect(await client.create(input)).toEqual({ ok: true });
  const [creation, notification] = fetchImpl.mock.calls;
  expect(creation![0]).toEqual(
    new URL('http://chat-service:3000/chat/conversations'),
  );
  expect(JSON.parse(creation![1]!.body as string)).toEqual({
    orderId: input.orderId,
    requesterId: input.requesterId,
    orderDescription: 'Coffee',
  });
  expect(creation![1]?.headers).toEqual({
    'content-type': 'application/json',
    'X-Service-Name': 'order-service',
    'X-Service-Key': 'test-key',
  });
  expect(notification![0]).toEqual(
    new URL('http://chat-service:3000/chat/send-system-notification'),
  );
  expect(JSON.parse(notification![1]!.body as string)).toEqual({
    orderId: input.orderId,
    messageId: input.messageId,
    message: 'The order has been created',
    triggeredByUserId: input.requesterId,
  });
});
it('reuses the message ID after a notification response is lost and accepts duplicate success', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    .mockRejectedValueOnce(new Error('connection reset'))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  expect(await client.create(input)).toMatchObject({
    ok: false,
    kind: 'transient',
  });
  expect(await client.create(input)).toEqual({ ok: true });
  expect(fetchImpl.mock.calls[1]![1]?.body).toBe(
    fetchImpl.mock.calls[3]![1]?.body,
  );
});
it.each([
  [503, 'transient'],
  [409, 'permanent'],
  [401, 'permanent'],
])('classifies HTTP %s and stops before notification', async (status, kind) => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: Number(status) }));
  expect(
    await createHttpChatClient(
      'http://chat-service:3000',
      'test-key',
      fetchImpl,
    ).create(input),
  ).toMatchObject({ ok: false, kind });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

// AI-generated
it('sends a status notification directly with the supplied UUID', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: 201 }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  const notification = {
    orderId: input.orderId,
    messageId: input.messageId,
    message: 'The order has been delivered',
  };
  await expect(client.notify(notification)).resolves.toEqual({ ok: true });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith(
    new URL('http://chat-service:3000/chat/send-system-notification'),
    expect.objectContaining({ body: JSON.stringify(notification) }),
  );
});

// AI-generated
it.each([
  [200, true, undefined],
  [503, false, 'transient'],
  [409, false, 'permanent'],
])('adds courier by order ID: HTTP %s', async (status, ok, kind) => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: Number(status) }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  const result = await client.addParticipant({
    orderId: input.orderId,
    userId: input.requesterId,
    role: 'COURIER',
  });
  expect(result).toMatchObject(ok ? { ok: true } : { ok: false, kind });
  expect(fetchImpl).toHaveBeenCalledWith(
    new URL(
      `http://chat-service:3000/chat/orders/${input.orderId}/participants`,
    ),
    expect.objectContaining({
      body: JSON.stringify({ userId: input.requesterId, role: 'COURIER' }),
      headers: {
        'content-type': 'application/json',
        'X-Service-Name': 'order-service',
        'X-Service-Key': 'test-key',
      },
    }),
  );
});

// AI-generated
it('sends the final notification before archiving and safely retries archive failure', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('{}', { status: 201 }))
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  const payload = {
    orderId: input.orderId,
    messageId: input.messageId,
    message: 'The order has been cancelled',
    archiveAfter: true,
  };
  expect(await client.notify(payload)).toMatchObject({
    ok: false,
    kind: 'transient',
  });
  expect(await client.notify(payload)).toEqual({ ok: true });
  expect(fetchImpl.mock.calls.map(([url]) => (url as URL).pathname)).toEqual([
    '/chat/send-system-notification',
    `/chat/orders/${input.orderId}/archive`,
    '/chat/send-system-notification',
    `/chat/orders/${input.orderId}/archive`,
  ]);
  expect(fetchImpl.mock.calls[0]![1]?.body).toBe(
    fetchImpl.mock.calls[2]![1]?.body,
  );
  expect(
    JSON.parse(fetchImpl.mock.calls[0]![1]!.body as string),
  ).not.toHaveProperty('archiveAfter');
  expect(fetchImpl.mock.calls[1]![1]?.body).toBeUndefined();
});
it('does not archive when the final notification fails', async () => {
  const fetchImpl = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response('{}', { status: 503 }));
  const client = createHttpChatClient(
    'http://chat-service:3000',
    'test-key',
    fetchImpl,
  );
  await expect(
    client.notify({
      orderId: input.orderId,
      messageId: input.messageId,
      message: 'Done',
      archiveAfter: true,
    }),
  ).resolves.toMatchObject({ ok: false, kind: 'transient' });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
