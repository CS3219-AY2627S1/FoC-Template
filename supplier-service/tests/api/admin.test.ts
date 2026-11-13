/*

Admin user tests 
- From a mock admin account verify the following 

1. GET supplier

2. PUT Supplier
- Test: Updating a supplier | Expected 200
- Test: Updating a deleted supplier | Expected 404
- Test: Updating a non-existent supplier | Expected 404
- Test: Concurrent updates to a supplier | Expected first response 200, second 409

3. DELETE Supplier 
- Test: Supplier Deletion | Expected 200 
- Test: Supplier deletion on false id | Expected 404
- Test: Supplier deletion on non-numeric id | Expected 400

4. POST Supplier 
- Test: Supplier creation for a mix of invalid fields | Expected 400
- Test: Supplier creation | Expected 201

The admin account is a token signed with the throwaway key pair from
tests/setup-env.ts, standing in for one the user service would issue. Write
routes require authenticate + requireRole(ADMIN).
*/

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { app } from '@/app';
import pool from '@database/db';
import { resetDatabase } from '../helpers/reset-database';
import { adminBearer, foreignBearer, signTestToken, userBearer } from '../helpers/auth-token';

const validSupplier = {
  name: '[Admin Test] Bubble Tea Counter',
  type: 'food/coffee',
  buildingName: 'UTown',
  locationDescription: 'Stephen Riady Centre, level 1',
  floor: 1,
  latitude: '1.304400',
  longitude: '103.772600',
  //createSupplierSchema mandates a full week, so authorization tests still need one
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    opensAt: '09:00:00',
    closesAt: '17:00:00',
    isClosed: false,
  })),
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

describe('admin GET /supplier/:id', () => {
  it('reads a supplier', async () => {
    const res = await request(app).get('/supplier/1').set('Authorization', adminBearer());

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ supplierId: 1, name: 'The Coffee Roaster' });
  });
});

describe('admin PUT /supplier/:id', () => {
  it('updates a supplier', async () => {
    const current = await request(app).get('/supplier/1');

    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: current.body.data.updatedAt });

    expect(res.status).toBe(200);
    expect(res.body.data.buildingName).toBe('COM2');
  });

  //supplier 3 is soft deleted in seed.sql, so an admin must not be able to revive it
  it('returns 404 when updating a deleted supplier', async () => {
    const res = await request(app)
      .put('/supplier/3')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
  });

  it('returns 404 when updating a supplier that never existed', async () => {
    const res = await request(app)
      .put('/supplier/9999')
      .set('Authorization', adminBearer())
      .send({ buildingName: 'COM2', expectedUpdatedAt: new Date().toISOString() });

    expect(res.status).toBe(404);
  });

  /*
  Two admins read the same version and write at the same time. Whichever lands
  first moves updated_at, so the other one matches no row and is rejected rather
  than silently overwriting the first write.
  */
  it('rejects the losing side of two concurrent updates', async () => {
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

    //exactly one of the two buildings was written
    const after = await request(app).get('/supplier/1');
    expect(['COM2', 'COM4']).toContain(after.body.data.buildingName);
  });
});

describe('admin DELETE /supplier/:id', () => {
  it('soft deletes a supplier', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', adminBearer());

    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      'SELECT deleted_at FROM public."Supplier_Database" WHERE id = 1',
    );
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('returns 404 for an id that does not exist', async () => {
    const res = await request(app).delete('/supplier/9999').set('Authorization', adminBearer());

    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric id', async () => {
    const res = await request(app).delete('/supplier/abc').set('Authorization', adminBearer());

    expect(res.status).toBe(400);
  });
});

describe('admin POST /supplier', () => {
  it('creates a supplier', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send(validSupplier);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: validSupplier.name, buildingName: 'UTown' });
  });

  it('rejects a mix of invalid fields', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', adminBearer())
      .send({ ...validSupplier, floor: 'ground', latitude: null, name: 42 });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Bad Request: Validation failed');
  });
});

/*
The writes are the whole reason this service cares who the caller is. These stay
as todos until authenticate is on the routes and reads JWT_PUBLIC_KEY from the
environment rather than the request body.
*/
describe('write routes reject a signed-in user who is not an administrator', () => {
  it('POST with a USER token is 403', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', userBearer())
      .send(validSupplier);

    expect(res.status).toBe(403);
  });
});

describe('write routes reject callers who cannot prove they are an admin', () => {
  const expiredAdmin = () => `Bearer ${signTestToken({ id: 'test-admin', expiresIn: -10 })}`;

  it('POST with no token is 401', async () => {
    const res = await request(app).post('/supplier').send(validSupplier);
    expect(res.status).toBe(401);
  });

  it('PUT with no token is 401', async () => {
    const res = await request(app).put('/supplier/1').send({ buildingName: 'COM2' });
    expect(res.status).toBe(401);
  });

  it('DELETE with no token is 401', async () => {
    const res = await request(app).delete('/supplier/1');
    expect(res.status).toBe(401);
  });

  it('POST with a malformed token is 401', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', 'Bearer not-a-jwt')
      .send(validSupplier);
    expect(res.status).toBe(401);
  });

  it('PUT with a malformed token is 401', async () => {
    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', 'Bearer not-a-jwt')
      .send({ buildingName: 'COM2' });
    expect(res.status).toBe(401);
  });

  it('DELETE with a malformed token is 401', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('POST with a token signed by an unknown key is 401', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', foreignBearer())
      .send(validSupplier);
    expect(res.status).toBe(401);
  });

  it('PUT with a token signed by an unknown key is 401', async () => {
    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', foreignBearer())
      .send({ buildingName: 'COM2' });
    expect(res.status).toBe(401);
  });

  it('DELETE with a token signed by an unknown key is 401', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', foreignBearer());
    expect(res.status).toBe(401);
  });

  it('POST with an expired admin token is 401', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', expiredAdmin())
      .send(validSupplier);
    expect(res.status).toBe(401);
  });

  it('PUT with an expired admin token is 401', async () => {
    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', expiredAdmin())
      .send({ buildingName: 'COM2' });
    expect(res.status).toBe(401);
  });

  it('DELETE with an expired admin token is 401', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', expiredAdmin());
    expect(res.status).toBe(401);
  });

  it('POST with a USER token is 403', async () => {
    const res = await request(app)
      .post('/supplier')
      .set('Authorization', userBearer())
      .send(validSupplier);
    expect(res.status).toBe(403);
  });

  it('PUT with a USER token is 403', async () => {
    const res = await request(app)
      .put('/supplier/1')
      .set('Authorization', userBearer())
      .send({ buildingName: 'COM2' });
    expect(res.status).toBe(403);
  });

  it('DELETE with a USER token is 403', async () => {
    const res = await request(app).delete('/supplier/1').set('Authorization', userBearer());
    expect(res.status).toBe(403);
  });
});

