// AI Assistance Disclosure:
// Tool: Claude Code (claude-sonnet-5-5), date: 2026-11-05
// Scope: HTTP tests (supertest, real test DB) for GET/PUT/DELETE /users/me/bookmarks, per the
//        2026-11-05 supplier-bookmarking spec. No requirements, architecture, schema, or API
//        decisions were made by the AI tool.
// Author review:
// Tool: Claude Code (model: claude-fable-5-1), date: 2026-11-10
// Scope: Fix F2 - debugged the ECONNRESET / "socket hang up" flake; replaced per-call
//        `request(app)` supertest servers with the shared loopback server in
//        tests/helpers/server.ts (`api()`). No test logic or assertions changed.
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api } from '../helpers/server.js';
import { getBookmarkRows, truncateAll } from '../helpers/db.js';
import { accessTokenFor, bearer, createActiveUser } from '../helpers/fixtures.js';

beforeEach(truncateAll);
afterEach(truncateAll);

const UNAUTHORIZED = { message: 'Unauthorized', code: 'UNAUTHORIZED' };

const call = (method: 'get' | 'put' | 'delete', token: string | undefined, suffix = '') => {
  const r = api()[method]('/users/me/bookmarks' + suffix);
  return token ? r.set('Authorization', bearer(token)) : r;
};

async function signedInUser(n: number) {
  const user = await createActiveUser(n);
  return { user, token: await accessTokenFor(user) };
}

describe('authentication', () => {
  it.each([
    ['get', ''],
    ['put', '/5'],
    ['delete', '/5'],
  ] as const)('%s %s without a token: 401', async (method, suffix) => {
    const res = await call(method, undefined, suffix);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(UNAUTHORIZED);
  });
});

describe('GET /users/me/bookmarks', () => {
  it('returns an empty list for a new user', async () => {
    const { token } = await signedInUser(1);
    const res = await call('get', token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ supplier_ids: [] });
  });
});

describe('PUT /users/me/bookmarks/:supplierId', () => {
  it('adds the bookmark: 200 and it appears in the list and the DB', async () => {
    const { user, token } = await signedInUser(1);
    const res = await call('put', token, '/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Supplier bookmarked', code: 'BOOKMARK_ADDED' });
    expect((await call('get', token)).body).toEqual({ supplier_ids: [7] });
    expect(await getBookmarkRows(user.id)).toHaveLength(1);
  });

  it('is safe to repeat', async () => {
    const { user, token } = await signedInUser(1);
    await call('put', token, '/7');
    const res = await call('put', token, '/7');
    expect(res.status).toBe(200);
    expect(await getBookmarkRows(user.id)).toHaveLength(1);
  });

  it('answers the 21st with 422 and the user-facing message', async () => {
    const { user, token } = await signedInUser(1);
    for (let id = 1; id <= 20; id += 1) expect((await call('put', token, '/' + id)).status).toBe(200);

    const res = await call('put', token, '/21');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      message: 'You can bookmark up to 20 suppliers. Remove one before adding another.',
      code: 'BOOKMARK_LIMIT_REACHED',
    });
    expect(await getBookmarkRows(user.id)).toHaveLength(20);
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648', '01'])('rejects id %s with 400', async (id) => {
    const { token } = await signedInUser(1);
    const res = await call('put', token, '/' + id);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Supplier id must be a positive whole number', code: 'VALIDATION_ERROR' });
  });
});

describe('DELETE /users/me/bookmarks/:supplierId', () => {
  it('removes the bookmark', async () => {
    const { token } = await signedInUser(1);
    await call('put', token, '/7');
    const res = await call('delete', token, '/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
    expect((await call('get', token)).body).toEqual({ supplier_ids: [] });
  });

  it('answers 200 when the bookmark was not saved', async () => {
    const { token } = await signedInUser(1);
    expect((await call('delete', token, '/7')).status).toBe(200);
  });

  it.each(['abc', '0', '-1', '1.5', '2147483648'])(
    'answers 200 without failing for a malformed id (%s): there is nothing to remove',
    async (id) => {
      const { user, token } = await signedInUser(1);
      await call('put', token, '/7');

      const res = await call('delete', token, '/' + id);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Bookmark removed', code: 'BOOKMARK_REMOVED' });
      expect(await getBookmarkRows(user.id)).toHaveLength(1);
    },
  );
});

describe('per-user isolation', () => {
  it('one user’s bookmarks never show up for or affect another', async () => {
    const a = await signedInUser(1);
    const b = await signedInUser(2);
    await call('put', a.token, '/7');
    expect((await call('get', b.token)).body).toEqual({ supplier_ids: [] });
    await call('delete', b.token, '/7');
    expect((await call('get', a.token)).body).toEqual({ supplier_ids: [7] });
  });
});
