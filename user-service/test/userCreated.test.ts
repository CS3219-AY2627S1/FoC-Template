import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildUserCreated } from '../src/events/userCreated';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('buildUserCreated', () => {
  it('returns a UserCreated payload with a string userId and a fresh eventId', () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const event = buildUserCreated(userId);

    assert.equal(event.type, 'user.created');
    assert.equal(typeof event.userId, 'string');
    assert.equal(event.userId, userId);
    assert.match(event.eventId, UUID_RE);
    assert.notEqual(event.eventId, userId);
    assert.equal(new Date(event.occurredAt).toISOString(), event.occurredAt);
  });

  it('accepts a non-UUID userId string', () => {
    const event = buildUserCreated('user-42');
    assert.equal(event.userId, 'user-42');
    assert.equal(typeof event.userId, 'string');
  });

  it('throws when userId is empty', () => {
    assert.throws(() => buildUserCreated(''), /userId must be a non-empty string/);
    assert.throws(() => buildUserCreated('   '), /userId must be a non-empty string/);
  });
});
