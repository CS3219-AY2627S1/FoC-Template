const { test } = require('node:test');
const assert = require('node:assert/strict');

test('update profile sends PATCH /users/me with name and username', async t => {
  const { updateMe } = require('../api/users.ts');
  const fetchBefore = global.fetch;
  const storageBefore = global.localStorage;
  t.after(() => { global.fetch = fetchBefore; global.localStorage = storageBefore; });
  global.localStorage = { getItem: () => 'token' };
  const profile = { firstName: 'B', lastName: 'Tester', username: 'btester' };
  global.fetch = async (url, options) => {
    assert.equal(url, '/backend/users/me');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.deepEqual(JSON.parse(options.body), profile);
    return { ok: true, status: 200, json: async () => ({ user: { ...profile, id: 'user-id', email: 'b@u.nus.edu', roles: ['USER'], createdAt: '2026-11-01T00:00:00Z' } }) };
  };
  const user = await updateMe(profile);
  assert.equal(user.username, 'btester');
  assert.equal(user.firstName, 'B');
});
