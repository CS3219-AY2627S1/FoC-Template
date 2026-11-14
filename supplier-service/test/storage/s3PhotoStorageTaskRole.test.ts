/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-06
 * Scope: ECS Fargate migration - checks an upload signs with credentials from the container credentials
 *        endpoint when no keys are set, using local stand-ins for that endpoint and S3, per George's task
 *        role decision of 2026-11-06. No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review: George Yeo
 */
import { createServer, type IncomingHttpHeaders, type RequestListener, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createS3PhotoStorage } from '../../src/storage/s3PhotoStorage.js';

const servers: Server[] = [];

async function listen(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe('S3 photo storage without keys', () => {
  it('signs uploads with the credentials ECS provides', async () => {
    const credentialsUrl = await listen((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          AccessKeyId: 'ASIATASKROLEKEY',
          SecretAccessKey: 'task-role-secret',
          Token: 'task-role-session-token',
          Expiration: new Date(Date.now() + 3_600_000).toISOString(),
        }),
      );
    });

    const received: IncomingHttpHeaders[] = [];
    const s3Url = await listen((req, res) => {
      received.push(req.headers);
      req.resume();
      req.on('end', () => {
        res.setHeader('etag', '"test"');
        res.end();
      });
    });

    // Removes other credential sources, which a developer's machine may have, so only ECS's can be used.
    vi.stubEnv('AWS_ACCESS_KEY_ID', '');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '');
    vi.stubEnv('AWS_PROFILE', '');
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', 'does-not-exist');
    vi.stubEnv('AWS_CONFIG_FILE', 'does-not-exist');
    vi.stubEnv('AWS_CONTAINER_CREDENTIALS_FULL_URI', `${credentialsUrl}/creds`);

    const storage = createS3PhotoStorage({ endpoint: s3Url, bucket: 'photos', region: 'ap-southeast-1' });
    const location = await storage.upload({ buffer: Buffer.from('x'), mimeType: 'image/png' });

    expect(location.startsWith(`${s3Url}/photos/`)).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]?.authorization).toContain('Credential=ASIATASKROLEKEY/');
    expect(received[0]?.['x-amz-security-token']).toBe('task-role-session-token');
  });
});
