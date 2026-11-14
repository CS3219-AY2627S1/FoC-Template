/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-haiku-4-5-20251001), date: 2026-09-30
 * Scope: Outbox task builders and task→queue routing (Phase 4 plan Task 1). The queue keys, task
 *        names and payload shapes are the recorded/team-supplied values. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { PHOTO_DELETION_QUEUE_KEY, PHOTO_DELETION_TASK_NAME } from './photoDeletionJob.js';

/** What a write transaction hands to the outbox: the Redis task name and its original payload. */
export interface OutboxTask {
  taskName: string;
  payload: unknown;
}

export const SUSPENSION_QUEUE_KEY = 'queue:supplier:suspension';
export const SUSPENSION_TASK_NAME = 'supplier_suspension';

export function buildSuspensionTask(supplierId: number): OutboxTask {
  return { taskName: SUSPENSION_TASK_NAME, payload: { supplier_id: supplierId } };
}

export function buildPhotoCleanupTask(photo: { photoId: number; location: string }): OutboxTask {
  return {
    taskName: PHOTO_DELETION_TASK_NAME,
    payload: { photo_id: photo.photoId, photo_location: photo.location },
  };
}

const QUEUE_KEY_BY_TASK = new Map<string, string>([
  [PHOTO_DELETION_TASK_NAME, PHOTO_DELETION_QUEUE_KEY],
  [SUSPENSION_TASK_NAME, SUSPENSION_QUEUE_KEY],
]);

/** The queue a task is relayed to, or undefined for an unknown task name. */
export function queueKeyForTask(taskName: string): string | undefined {
  return QUEUE_KEY_BY_TASK.get(taskName);
}
