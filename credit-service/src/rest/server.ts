// AI Assistance Disclosure:
// Tool: OpenAI Codex (model: GPT-6), date: 2026-10-21-2026-10-22 (Asia/Singapore).
// Scope: Implemented the human-finalized own-balance/history REST paths, query fields, JWT identity, and JSON shapes. Added public database health and omitted internal history sequence IDs from REST entries. Added/tested/documented startup-only listener health with database-based HTTP status as the human specified.
// Refactor: Moved/imports updated for the human-specified src layout (entry 024).
// Author review: I decided to remove the sequence IDs from the REST responses, configured /health for listener on top of database.
// Prompts and key responses: ../../ai/usage-log.md, entries 005–026, 031, 038.

import { createServer, type ServerResponse } from 'node:http';
import { status } from '@grpc/grpc-js';
import type { CreditService } from '../services/CreditService';
import { AuthenticationError, userTokenVerifier } from './auth';
import { grpcError } from '../grpc/errors';
import { ValidationError } from '../services/validation';

function json(response: ServerResponse, code: number, payload: unknown): void {
  response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function optionalQuery(query: URLSearchParams, name: string): string | undefined {
  const values = query.getAll(name);
  if (values.length > 1) throw new ValidationError(`${name} must occur at most once`);
  return values[0];
}

export function createRestServer(
  service: CreditService,
  publicKeyPem: string,
  pingDatabase: () => Promise<boolean>,
  listenerStarted: () => boolean,
) {
  const identify = userTokenVerifier(publicKeyPem);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://credit-service');
      if (request.method === 'GET' && url.pathname === '/health') {
        const dbUp = await pingDatabase();
        json(response, dbUp ? 200 : 503, {
          status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down',
          listener: listenerStarted() ? 'up' : 'down',
        });
        return;
      }
      if (request.method !== 'GET' || !['/credits/me/balance', '/credits/me/history'].includes(url.pathname)) {
        json(response, 404, { error: 'Not Found', message: 'Endpoint not found.' });
        return;
      }
      const userId = identify(request.headers.authorization);
      if (url.pathname === '/credits/me/balance') {
        json(response, 200, await service.getBalance({ userId }));
      } else {
        const rawSize = optionalQuery(url.searchParams, 'pageSize');
        if (rawSize !== undefined && !/^[0-9]+$/.test(rawSize)) throw new ValidationError('Invalid pageSize');
        const result = await service.getUserCreditHistory({
          userId, pageSize: rawSize === undefined ? undefined : Number(rawSize),
          pageToken: optionalQuery(url.searchParams, 'pageToken'),
        });
        const entries = result.entries.map(({ sequenceId: _sequenceId, ...entry }) => entry);
        json(response, 200, { entries, nextPageToken: result.nextPageToken });
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        json(response, 401, { error: 'Unauthorized', message: error.message });
        return;
      }
      const mapped = grpcError(error);
      const [code, label] = mapped.code === status.INVALID_ARGUMENT ? [400, 'Bad Request']
        : mapped.code === status.NOT_FOUND ? [404, 'Not Found']
        : [status.UNAVAILABLE, status.ABORTED, status.DEADLINE_EXCEEDED].includes(mapped.code) ? [503, 'Service Unavailable']
        : [500, 'Internal Server Error'];
      json(response, code, { error: label, message: mapped.details });
    }
  });
}
