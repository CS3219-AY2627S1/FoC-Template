import { describe, expect, it } from 'vitest';

import { toResult } from '@/lib/action-result';
import { ServiceError } from '@/lib/service-request';
import { UserServiceError } from '@/lib/user-service';

describe('toResult', () => {
  it('wraps a value as a success', async () => {
    await expect(toResult(async () => ({ n: 1 }))).resolves.toEqual({
      ok: true,
      n: 1,
    });
  });

  it('turns a service error into a failure, keeping its code', async () => {
    const result = await toResult(async () => {
      throw new ServiceError(404, 'Missing', 'NOT_FOUND');
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      message: 'Missing',
      code: 'NOT_FOUND',
    });
  });

  it('applies the override for the failing status', async () => {
    const result = await toResult(
      async () => {
        throw new ServiceError(409, 'Conflict');
      },
      { 409: { message: 'Taken', code: 'TAKEN' }, 404: { message: 'Gone' } },
    );
    expect(result).toMatchObject({
      status: 409,
      message: 'Taken',
      code: 'TAKEN',
    });
  });

  it('turns a User Service error into a failure', async () => {
    const result = await toResult(async () => {
      throw new UserServiceError(403, 'Admin privileges required');
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      message: 'Admin privileges required',
      code: undefined,
    });
  });

  it('rethrows anything that is not a service error', async () => {
    await expect(
      toResult(async () => {
        throw new TypeError('bug');
      }),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
