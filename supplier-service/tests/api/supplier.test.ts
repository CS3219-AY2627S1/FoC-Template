/*
API-level integration tests. These run against the Supabase Postgres container
started in tests/global-setup.ts, driving the real express app through supertest
so routing, validation, the repository and the error handler are all exercised.

Endpoint behaviour only. Who is allowed to call what is covered by admin.test.ts
and user.test.ts; the writes here carry an admin token so they keep working once
the router wires up authenticate.
*/

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from '@/app';
import pool from '@database/db';
import { resetDatabase } from '../helpers/reset-database';
import { adminBearer } from '../helpers/auth-token';

/*
createSupplierSchema mandates all 7 days, so every create payload carries a full week.
time columns round-trip as HH:MM:SS, so the fixtures use that form to compare literally.
*/
const fullWeek = () =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    opensAt: '09:00:00',
    closesAt: '17:00:00',
    isClosed: false,
  }));

const newSupplier1 = {
  name: '[Test Supplier] Noodle Bar',
  type: 'food',
  buildingName: 'COM1',
  locationDescription: 'Basement canteen, stall 4',
  floor: 1,
  //numeric columns round-trip as strings through pg
  latitude: '1.294900',
  longitude: '103.774500',
  openingHours: fullWeek(),
};

beforeAll(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await pool.end();
});

//Test one get all suppliers that are not soft deleted
describe('GET /suppliers', () => {
  it('returns only the suppliers that are not soft deleted', async () => {
    const res = await request(app).get('/suppliers');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    //getAllSuppliersService has no ORDER BY, so compare as a set
    expect(res.body.data.map((s: any) => s.name).sort()).toEqual([
      'Central Print Shop',
      'The Coffee Roaster',
    ]);
  });

  it('never exposes the deletedAt column', async () => {
    const res = await request(app).get('/suppliers');

    expect(res.body.data[0]).not.toHaveProperty('deletedAt');
  });
});

//Test two:  Get supplier id 1 from seed.sql which is Coffee Roaster
describe('GET /supplier/:id', () => {
  it('returns the requested supplier', async () => {
    const res = await request(app).get('/supplier/1');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      supplierId: 1,
      name: 'The Coffee Roaster',
      buildingName: 'COM3',
    });
  });

  it('never exposes the deletedAt column', async () => {
    const res = await request(app).get('/supplier/1');

    expect(res.body.data).not.toHaveProperty('deletedAt');
  });

  //supplier 3 in seed.sql is soft deleted, so it has to look like it is gone
  it('returns 404 for a soft deleted supplier', async () => {
    const res = await request(app).get('/supplier/3');

    expect(res.status).toBe(404);
    expect(res.body.data).toBeUndefined();
  });

  it('returns 404 for an id that was never used', async () => {
    const res = await request(app).get('/supplier/9999');

    expect(res.status).toBe(404);
  });

  //a non-numeric id is a malformed request, not a missing supplier
  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).get('/supplier/abc');

    expect(res.status).toBe(400);
  });
});

//sends new supplier. expect response 201
describe('POST /supplier', () => {
  it('creates a supplier and returns it', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send(newSupplier1);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: newSupplier1.name, buildingName: 'COM1' });
    //identity sequence was moved past the seeded ids by seed.sql
    expect(res.body.data.supplierId).toBeGreaterThan(3);
  });

  //ensure the same supplier is not created twice...
  it('persists the new supplier', async () => {
    await request(app).post('/supplier').set('Authorization', adminBearer()).send(newSupplier1);

    const res = await request(app).get('/suppliers');
    expect(res.body.data).toHaveLength(3);
  });

  it('rejects a payload that is missing required fields', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ name: 'Nameless' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Bad Request: Validation failed');
  });

  it('rejects a duplicate active supplier name with 409', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...newSupplier1, name: 'The Coffee Roaster' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('already exists');
  });

  //the unique index is partial, so a soft deleted name is free to reuse
  it('allows reusing the name of a soft deleted supplier', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...newSupplier1, name: 'Campus Bookstore' });

    expect(res.status).toBe(201);
  });

  //the response only carries the supplier, so the hours are checked in the table
  it('writes one opening hours row per day', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send(newSupplier1);

    const { rows } = await pool.query(
      'SELECT day_of_week, opens_at, closes_at, is_closed FROM public.supplier_opening_hours WHERE supplier_id = $1 ORDER BY day_of_week',
      [res.body.data.supplierId],
    );

    expect(rows).toHaveLength(7);
    expect(rows.map((r: any) => r.day_of_week)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows[0]).toMatchObject({ opens_at: '09:00:00', closes_at: '17:00:00', is_closed: false });
  });

  //length(7) on the array: a partial week is rejected before any SQL runs
  it('rejects a payload that does not cover all 7 days', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...newSupplier1, openingHours: fullWeek().slice(0, 6) });

    expect(res.status).toBe(400);
  });

  /*
  Seven entries that are not seven distinct days would hit the (supplier_id, day_of_week)
  unique constraint, which raises the same 23505 as a duplicate name. The refine on
  createSupplierSchema catches it first so the 409 path stays unambiguous.
  */
  it('rejects a week that repeats a day', async () => {
    const repeated = fullWeek();
    repeated[6] = { ...repeated[6], dayOfWeek: 0 };

    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...newSupplier1, openingHours: repeated });

    expect(res.status).toBe(400);
  });

  //both inserts share one transaction, so a day the table rejects must undo the supplier too
  it('rolls back the supplier when a day violates the check constraint', async () => {
    const contradictory = fullWeek();
    //is_closed with times set is exactly what the table forbids
    contradictory[3] = { ...contradictory[3], isClosed: true };

    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...newSupplier1, openingHours: contradictory });

    expect(res.status).toBe(400);

    const { rows } = await pool.query(
      'SELECT id FROM public."Supplier_Database" WHERE "Name" = $1',
      [newSupplier1.name],
    );
    expect(rows).toHaveLength(0);
  });
});

/*
seed.sql gives suppliers 1 and 2 days 1-5 only, so day 0 and day 6 exist as valid
days of the week with no row behind them. Supplier 3 is soft deleted.
*/
describe('PUT /supplier/:id/openingHours/:dayOfWeek', () => {
  const openLate = { opensAt: '10:00:00', closesAt: '22:00:00', isClosed: false };

  it('replaces the hours for one day', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/1')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ supplierId: 1, dayOfWeek: 1, ...openLate });
    expect(res.body.message).toContain('Monday');
  });

  it('leaves the other days alone', async () => {
    await request(app).put('/supplier/1/openingHours/1').set('Authorization', adminBearer()).send(openLate);

    const { rows } = await pool.query(
      'SELECT opens_at FROM public.supplier_opening_hours WHERE supplier_id = 1 AND day_of_week = 2',
    );
    expect(rows[0].opens_at).toBe('09:00:00');
  });

  //a day with no times is how the table stores "closed", so both must be null
  it('closes a day when the times are null', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/2')
      .set('Authorization', adminBearer())
      .send({ opensAt: null, closesAt: null, isClosed: true });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isClosed: true, opensAt: null, closesAt: null });
  });

  //the trigger owns updated_at, so the service never sets it by hand
  it('lets the database trigger move updatedAt', async () => {
    const before = await pool.query(
      'SELECT updated_at FROM public.supplier_opening_hours WHERE supplier_id = 1 AND day_of_week = 1',
    );

    await request(app).put('/supplier/1/openingHours/1').set('Authorization', adminBearer()).send(openLate);

    const after = await pool.query(
      'SELECT updated_at FROM public.supplier_opening_hours WHERE supplier_id = 1 AND day_of_week = 1',
    );
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(before.rows[0].updated_at.getTime());
  });

  it('returns 404 for a supplier that does not exist', async () => {
    const res = await request(app)
      .put('/supplier/9999/openingHours/1')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(404);
  });

  /*
  The foreign key does not know about deleted_at, so without the parent lookup in the
  service a soft deleted supplier would still be editable through the child table.
  */
  it('returns 404 for a soft deleted supplier', async () => {
    await pool.query(
      "INSERT INTO public.supplier_opening_hours (supplier_id, day_of_week, opens_at, closes_at, is_closed) VALUES (3, 1, '09:00', '17:00', false)",
    );

    const res = await request(app)
      .put('/supplier/3/openingHours/1')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Supplier 3 not found');
  });


  //the check constraint maps to 400, not 500: the client sent an impossible day
  it('returns 400 when a closed day still carries times', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/1')
      .set('Authorization', adminBearer())
      .send({ opensAt: '09:00:00', closesAt: '17:00:00', isClosed: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('closed with no times');
  });

  it('returns 400 when an open day has no times', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/1')
      .set('Authorization', adminBearer())
      .send({ opensAt: null, closesAt: null, isClosed: false });

    expect(res.status).toBe(400);
  });

  /*
  required() on the body schema. Without it Drizzle would drop the undefined keys and
  throw "No values to set", which the handler cannot tell apart from a real fault.
  */
  it('returns 400 for a body that omits a field', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/1')
      .set('Authorization', adminBearer())
      .send({ isClosed: true });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Bad Request: Validation failed');
  });

  //without param validation this reaches postgres as NaN and comes back a 500
  it('returns 400 for a non-numeric day', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/monday')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a day outside 0-6', async () => {
    const res = await request(app)
      .put('/supplier/1/openingHours/7')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-numeric supplier id', async () => {
    const res = await request(app)
      .put('/supplier/abc/openingHours/1')
      .set('Authorization', adminBearer())
      .send(openLate);

    expect(res.status).toBe(400);
  });
});

//update successful with partial fields
describe('PUT /supplier/:id', () => {
  it('updates a supplier when expectedUpdatedAt matches', async () => {
    const current = await request(app).get('/supplier/1');

    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: current.body.data.updatedAt });

    expect(res.status).toBe(200);
    expect(res.body.data.buildingName).toBe('COM2');
    expect(res.body.data.updatedAt).not.toBe(current.body.data.updatedAt);
  });

  it('returns 409 when the row changed since it was read', async () => {
    const stale = new Date('2020-01-01T00:00:00.000Z').toISOString();

    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: stale });

    expect(res.status).toBe(409);
  });

  /*
  Optimistic concurrency: both writers read the same updated_at and fire at once.
  The first write moves updated_at, so the second no longer matches any row.
  */
  it('lets only one of two concurrent updates win', async () => {
    const current = await request(app).get('/supplier/1');
    const expectedUpdatedAt = current.body.data.updatedAt;

    const [first, second] = await Promise.all([
      request(app)
        .put('/supplier/1')
        .set('Authorization', adminBearer())
        .send({ buildingName: 'COM2', expectedUpdatedAt }),
      request(app)
        .put('/supplier/1')
        .set('Authorization', adminBearer())
        .send({ buildingName: 'COM4', expectedUpdatedAt }),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
  });

  //update for a supplier that doesn't exist
  it('returns 404 for a supplier that does not exist', async () => {
    const res = await request(app)
      .put('/supplier/9999')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app)
      .put('/supplier/abc')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: new Date().toISOString() });

    expect(res.status).toBe(400);
  });

  it('returns 400 when expectedUpdatedAt is missing', async () => {
    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /supplier/:id', () => {
  it('soft deletes the supplier', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', adminBearer());
    expect(res.status).toBe(200);

    const remaining = await request(app).get('/suppliers');
    expect(remaining.body.data).toHaveLength(1);

    //the row is still there, just flagged
    const { rows } = await pool.query(
      'SELECT deleted_at FROM public."Supplier_Database" WHERE id = 1',
    );
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('returns 404 when the supplier is already deleted', async () => {
    const res = await request(app).delete('/supplier/3').set('Authorization', adminBearer());

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).delete('/supplier/abc').set('Authorization', adminBearer());

    expect(res.status).toBe(400);
  });
});

/*
seed.sql never fills "Location Description", so it defaults to '' and the fts
vector on the seeded rows only covers Name and Building.
*/
describe('GET /suppliers/search', () => {
  it('matches on the name', async () => {
    const res = await request(app).get('/suppliers/search').query({ q: 'coffee' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('The Coffee Roaster');
  });

  it('matches on the building', async () => {
    const res = await request(app).get('/suppliers/search').query({ q: 'AS8' });

    expect(res.status).toBe(200);
    expect(res.body.data.map((s: any) => s.name)).toEqual(['Central Print Shop']);
  });

  it('returns the same camelCase shape as the rest of the API', async () => {
    const res = await request(app).get('/suppliers/search').query({ q: 'coffee' });

    expect(res.body.data[0]).toMatchObject({
      supplierId: 1,
      name: 'The Coffee Roaster',
      buildingName: 'COM3',
      locationDescription: expect.any(String),
    });
    expect(res.body.data[0]).not.toHaveProperty('Name');
  });

  //an empty result is a successful query, not a missing resource
  it('returns an empty list when nothing matches', async () => {
    const res = await request(app).get('/suppliers/search').query({ q: 'zzzznomatch' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('never returns a soft deleted supplier', async () => {
    const res = await request(app).get('/suppliers/search').query({ q: 'bookstore' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  //the search term is a bind parameter, so quotes must not break out of the statement
  it('treats a quote-heavy search term as text', async () => {
    const res = await request(app)
      .get('/suppliers/search')
      .query({ q: "'); drop table public.\"Supplier_Database\"; --" });

    expect(res.status).toBe(200);

    const stillThere = await request(app).get('/suppliers');
    expect(stillThere.body.data).toHaveLength(2);
  });
});

describe('GET /suppliers/category', () => {
  it('filters by supplier category', async () => {
    const res = await request(app).get('/suppliers/category').query({ type: 'printing' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Central Print Shop');
  });

  //a category nobody is in is still a valid question with an empty answer
  it('returns an empty list for a category with no suppliers', async () => {
    const res = await request(app).get('/suppliers/category').query({ type: 'shopping' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a category outside the enum', async () => {
    const res = await request(app).get('/suppliers/category').query({ type: 'spaceship' });

    expect(res.status).toBe(400);
  });
});

describe('GET /suppliers/search-radius', () => {
  //seed: Coffee Roaster at (1.294167, 103.773611), Print Shop ~240m away, Bookstore is soft-deleted
  it('returns active suppliers within the radius, nearest first', async () => {
    const res = await request(app).get('/suppliers/search-radius').query({
      latitude: 1.294167,
      longitude: 103.773611,
      radius: 500,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.map((s: { name: string }) => s.name)).toEqual([
      'The Coffee Roaster',
      'Central Print Shop',
    ]);
    expect(res.body.data[0]).not.toHaveProperty('location');
  });

  it('does not match /suppliers/search, and excludes suppliers outside the radius', async () => {
    const res = await request(app).get('/suppliers/search-radius').query({
      latitude: 1.294167,
      longitude: 103.773611,
      radius: 50,
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('The Coffee Roaster');
  });

  it('rejects a request with no coordinates', async () => {
    const res = await request(app).get('/suppliers/search-radius');

    expect(res.status).toBe(400);
  });
});
