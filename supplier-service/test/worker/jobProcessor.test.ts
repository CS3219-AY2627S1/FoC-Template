/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the job processor: routing, dead-lettering, rethrow so BullMQ schedules the retry
 *        (Phase 4 plan Task 11). No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): added review follow-up tests (name-based unrecoverable detection, missing attempts option, dead-letter log content); renamed the local process const to processJob.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createJobProcessor } from '../../src/worker/jobProcessor.js';

function build(handler: (payload: unknown) => Promise<void>) {
  const insert = vi.fn().mockResolvedValue(undefined);
  const log = vi.fn();
  const processJob = createJobProcessor({
    handlers: { work: handler },
    deadLetters: { insert },
    log,
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { processJob, insert, log };
}

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j-1',
  name: 'work',
  data: { a: 1 },
  attemptsMade: 0,
  opts: { attempts: 5 },
  ...over,
});

describe('job processor', () => {
  it('runs the handler with the job data and dead-letters nothing on success', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const { processJob, insert } = build(handler);
    await processJob(job());
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])('rethrows without dead-lettering on attempt %i so BullMQ schedules the retry', async (made) => {
    const { processJob, insert } = build(vi.fn().mockRejectedValue(new Error('downstream down')));
    await expect(processJob(job({ attemptsMade: made }))).rejects.toThrow('downstream down');
    expect(insert).not.toHaveBeenCalled();
  });

  it('writes one dead-letter row on the 5th failed attempt, then rethrows', async () => {
    const { processJob, insert } = build(vi.fn().mockRejectedValue(new Error('downstream down')));
    await expect(processJob(job({ attemptsMade: 4 }))).rejects.toThrow('downstream down');
    expect(insert).toHaveBeenCalledTimes(1);
    const entry = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({ jobId: 'j-1', taskName: 'work', payload: { a: 1 }, failedAt: '2026-09-30 10:00:00' });
    expect(String(entry.errorTrace)).toContain('downstream down');
  });

  it('dead-letters a bad job (UnrecoverableError) immediately, on the first attempt', async () => {
    const { processJob, insert } = build(vi.fn().mockRejectedValue(new UnrecoverableError('bad payload')));
    await expect(processJob(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('dead-letters an unknown job name immediately and fails it unrecoverably', async () => {
    const { processJob, insert } = build(vi.fn());
    await expect(processJob(job({ name: 'nope' }))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(String((insert.mock.calls[0]?.[0] as { errorTrace: string }).errorTrace)).toContain('nope');
  });

  it('logs a failed dead-letter insert and still rethrows the original error', async () => {
    const { processJob, insert, log } = build(vi.fn().mockRejectedValue(new UnrecoverableError('bad payload')));
    insert.mockRejectedValueOnce(new Error('db down'));
    await expect(processJob(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });

  it('dead-letters an error named UnrecoverableError (not the imported class) on the first attempt and rethrows', async () => {
    const error = Object.assign(new Error('x'), { name: 'UnrecoverableError' });
    const { processJob, insert } = build(vi.fn().mockRejectedValue(error));
    await expect(processJob(job({ attemptsMade: 0 }))).rejects.toBe(error);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('dead-letters immediately when opts.attempts is undefined (a single attempt)', async () => {
    const { processJob, insert } = build(vi.fn().mockRejectedValue(new Error('down')));
    await expect(processJob(job({ attemptsMade: 0, opts: {} }))).rejects.toThrow('down');
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('records a non-Error rejection', async () => {
    const { processJob, insert } = build(vi.fn().mockRejectedValue('plain string'));
    await expect(processJob(job({ attemptsMade: 4 }))).rejects.toBe('plain string');
    expect(String((insert.mock.calls[0]?.[0] as { errorTrace: string }).errorTrace)).toContain('plain string');
  });
});
