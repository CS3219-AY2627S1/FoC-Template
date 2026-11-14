/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Photo-deletion job builder (Phase 3 plan Task 1). The queue key and task name are the
 *        values the team supplied. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 * Scope (2026-09-30, Claude Code, model: claude-sonnet-5-5): removed buildPhotoDeletionJob, kept the queue key and task name constants (Phase 4 plan Task 7).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
export const PHOTO_DELETION_QUEUE_KEY = 'queue:image:cleanup';
export const PHOTO_DELETION_TASK_NAME = 'image_cleanup';
