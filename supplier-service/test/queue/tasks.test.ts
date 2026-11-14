/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-haiku-4-5-20251001), date: 2026-09-30
 * Scope: Tests for the outbox task builders and task→queue routing (Phase 4 plan Task 1). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it } from 'vitest';
import {
  SUSPENSION_QUEUE_KEY,
  SUSPENSION_TASK_NAME,
  buildPhotoCleanupTask,
  buildSuspensionTask,
  queueKeyForTask,
} from '../../src/queue/tasks.js';

describe('suspension task', () => {
  it('uses the team-supplied queue key, task name and payload', () => {
    expect(SUSPENSION_QUEUE_KEY).toBe('queue:supplier:suspension');
    expect(SUSPENSION_TASK_NAME).toBe('supplier_suspension');
    expect(buildSuspensionTask(101)).toEqual({ taskName: 'supplier_suspension', payload: { supplier_id: 101 } });
  });
});

describe('photo cleanup task', () => {
  it('carries photo_id and photo_location under the image_cleanup task name', () => {
    expect(buildPhotoCleanupTask({ photoId: 7, location: 'loc-7' })).toEqual({
      taskName: 'image_cleanup',
      payload: { photo_id: 7, photo_location: 'loc-7' },
    });
  });
});

describe('queueKeyForTask', () => {
  it('maps each task name to its queue', () => {
    expect(queueKeyForTask('image_cleanup')).toBe('queue:image:cleanup');
    expect(queueKeyForTask('supplier_suspension')).toBe('queue:supplier:suspension');
  });

  it('returns undefined for an unknown task, including names that exist on Object.prototype', () => {
    expect(queueKeyForTask('nope')).toBeUndefined();
    expect(queueKeyForTask('constructor')).toBeUndefined();
  });
});
