import postgres from '@prisma/orm-postgres/runtime';
import config from '../config.ts';
import type { Contract } from './contract.d.ts';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: config.dbConnectionString,
});

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbTxUnion = Db | Tx;

export function isTransaction(ctx: DbTxUnion): ctx is Tx {
  return !('transaction' in ctx) || typeof ctx.transaction !== 'function';
}

let connection: Promise<void> | undefined;

export function connectDatabase(): Promise<void> {
  if (!config.dbConnectionString) {
    return Promise.reject(new Error(
      'Set CREDIT_DB_URL in the project root .env, or provide DATABASE_URL in the environment.',
    ));
  }

  connection ??= db.connect().then(() => undefined).catch((error: unknown) => {
    connection = undefined;
    throw error;
  });
  return connection;
}
