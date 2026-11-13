import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { status } from '@grpc/grpc-js';
import { createSupplierClient, startServer, stopServer } from '@foc/grpc';
import { createGrpcServer } from '../../grpc/src/grpc/server';
import pool from '@database/db';
import { resetDatabase } from '../helpers/reset-database';

beforeAll(async () => {
  await resetDatabase();
});

afterEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await pool.end();
});

describe('GetSupplier gRPC', () => {
  async function withClient(
    run: (client: ReturnType<typeof createSupplierClient>) => Promise<void>,
  ) {
    const server = createGrpcServer();
    const port = await startServer(server, 0, '127.0.0.1');
    const client = createSupplierClient(`127.0.0.1:${port}`, { timeoutMs: 3000 });
    try {
      await run(client);
    } finally {
      client.close();
      await stopServer(server, 100);
    }
  }

  it('returns the supplier name, latitude and longitude', async () => {
    await withClient(async (client) => {
      const supplier = await client.getSupplier({ supplierId: '1' });

      expect(supplier.supplierId).toBe('1');
      expect(supplier.name).toBe('The Coffee Roaster');
      expect(supplier.latitude).toBeCloseTo(1.294167, 5);
      expect(supplier.longitude).toBeCloseTo(103.773611, 5);
    });
  });

  it('returns NOT_FOUND for a soft-deleted supplier', async () => {
    await withClient(async (client) => {
      await expect(client.getSupplier({ supplierId: '3' })).rejects.toMatchObject({
        code: status.NOT_FOUND,
      });
    });
  });

  it('returns INVALID_ARGUMENT for a non-positive id', async () => {
    await withClient(async (client) => {
      await expect(client.getSupplier({ supplierId: '0' })).rejects.toMatchObject({
        code: status.INVALID_ARGUMENT,
      });
    });
  });
});
