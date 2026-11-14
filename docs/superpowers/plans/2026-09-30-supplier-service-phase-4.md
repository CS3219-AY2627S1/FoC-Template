<!--
AI Assistance Disclosure:
Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
Scope: Implementation plan for SupplierServiceSpec.md "Phase 4 — Admin Soft-Delete and Downstream Workflow",
       transcribing decisions the team already recorded in SupplierServiceArchitecture.md (§6.2, §7, §7.1,
       §7.5, §8.1, §8.2) and the answers the team gave in chat on 2026-09-30 (four rounds; see "Decisions
       this plan implements"). No requirements, architecture, schema, or API decisions were made by the AI
       tool. The few implementation-level readings the plan needs are listed under "Readings still to
       confirm". The code in this plan has not been compiled or run.
Author review:
-->

# Supplier Service Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver F8.4: `DELETE /api/v1/admin/suppliers/:id` (soft delete), and a separate worker process (with its own container) that consumes the suspension and photo-cleanup queues on **BullMQ**, retrying with timestamped delayed jobs (max 5 attempts, 5/25/125/625 s) and writing a `dead_letter_jobs` row on exhaustion or for a bad job. Every background task is handed over through a **transactional outbox**: the supplier write and its outbox row commit together, and a scheduled relay (every second) enqueues the row into BullMQ and then deletes it. Also rework reactivation of a soft-deleted supplier so the edit cycle is attempted first and the flags are restored in the same commit.

**Architecture:** Same layers as Phases 2–3 for the endpoints (controller → business service → persistence interface → MySQL). The API process never talks to BullMQ any more: the write transactions insert rows into a new `outbox` table. The worker process runs (a) one BullMQ `Worker` per task queue, whose processor routes by job name to a handler, writes dead-letter rows and rethrows so BullMQ owns retry timing, and (b) an outbox relay driven by a BullMQ job scheduler ticking every 1000 ms. Order/Message Service calls sit behind two ports with logging mock adapters.

**Tech Stack:** TypeScript, Express 4, `mysql2`, `ioredis`, `zod`, `multer`, Vitest, Supertest (already in the repo) plus **`bullmq`** (new; chosen by the team, 2026-09-30).

**Every task also requires** (root `AGENTS.md` §4, §5, §7): the AI disclosure header on each created file (edited files get an appended dated `Scope`/`Author review` pair; never write the author's name), and one log entry plus one README "Log index" row when the phase is finished (Task 17). Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Run everything from `supplier-service/` unless a step says otherwise (the repo root is `..`). Tests live in `test/`, mirroring `src/`.

---

## Decisions this plan implements (all written down)

| Decision | Where recorded |
| --- | --- |
| `DELETE /api/v1/admin/suppliers/:id`, `admin`/`super admin` only; soft delete sets `is_deleted`, `is_active` untouched | Arch §7 table, §6.2; Spec Phase 4, F8.4.1 |
| Repeated `DELETE` after a successful delete, or an unknown supplier, returns `404` | Arch §7.5, §7.1 |
| Worker runs jobs shaped `{id, task_name, payload}`; calls the Order Service delete entrypoint then the Message Service notify entrypoint | Arch §8.1; Spec Phase 4, F8.4.2, F8.4.3 |
| Max 5 attempts, exponential backoff; on exhaustion insert `dead_letter_jobs` (`job_id`, `task_name`, `payload`, last `error_trace`, `failed_at`, `status` default `UNRESOLVED`) | Arch §8.1, §6.4 |
| Same worker/queue handles the Phase 3 excluded-photo deletion (`queue:image:cleanup`, `image_cleanup`, payload `{photo_id, photo_location}`) through the storage interface | Arch §8.2 step 7; Spec Phase 4; Phase 3 plan |
| Order/Message contracts stay mocked | Arch §9 items 5, 17; Spec Phase 4 |
| Timestamps are Singapore time | Arch §9 item 11 |
| DELETE success is `200` with a small JSON body; **all API responses use `id`**, so the body is `{ id, isDeleted: true }` | **team answers, rounds 1 and 2** |
| One suspension job on `queue:supplier:suspension`, `task_name` `supplier_suspension`, payload `{supplier_id}`; the one job does the Order delete then the Message notify | **team answer, round 1** |
| Worker is a separate entrypoint with a **dedicated container config, including for development** | **team answers, rounds 1 and 2** |
| Retry delays 5 s, 25 s, 125 s, 625 s | **team answer, round 1** |
| **Retries do not happen inside the worker.** A queue with timestamps signals when a failed job is next tried, freeing the worker for other jobs. **Use BullMQ** | **team answer, round 2** |
| A bad job is written to the dead letter directly (no retries) | **team answer, round 2** |
| Deletion bumps `updated_on` and `version` | **team answer, round 2** |
| Standard shutdown signals (`SIGINT`/`SIGTERM`); the last (in-flight) job is allowed to finish | **team answer, round 2** |
| Confirm idempotency against the current API configuration, and that the suspension job is safe to re-run as a unit | **team answer, round 2** (Task 15) |
| Order/Message mocks are ports with logging adapters plus an env switch to force failure | **team answer, round 1** |
| **Reactivation:** the record is returned to `is_deleted = false` and `is_active = true`; changes to details and images are handled by the typical edit-supplier cycle, with the edit attempted before the flag restore is committed | **team answers, rounds 2 and 3** |
| The photo-store endpoint inside containers is `http://host.docker.internal:9000` for internal development | **team answer, round 3** |
| **Transactional outbox.** When the supplier write commits, an entry is committed to a dedicated outbox table in the same transaction. A scheduled job runs every second; if the outbox has entries, each package is read and used to enqueue a task in the BullMQ queue, and once it is successfully enqueued the entry is deleted from the outbox | **team answer, round 4** |
| **Outbox columns:** autoincrement `id` (order, and used for deletion), the task type (the Redis task name), the payload (original content), and `version` (version 1 processed before 2) | **team answer, round 4** |
| **`version` is the supplier version**, so that multiple tasks for the same supplier are ordered as intended | **team answer, round 4** |
| **All enqueues go through the outbox:** the delete suspension job **and** the excluded-photo cleanup jobs from PUT and reactivation | **team answer, round 4** |
| The relay is a **BullMQ job scheduler in the worker** process | **team answer, round 4** |

## Values this plan fixes from the team's answers

- `SUSPENSION_QUEUE_KEY = 'queue:supplier:suspension'`, `SUSPENSION_TASK_NAME = 'supplier_suspension'`, payload `{ supplier_id: <number> }`.
- `attempts: 5`; delay after the n-th failed attempt = `5000 * 5^(n-1)` ms → 5 s, 25 s, 125 s, 625 s (BullMQ custom backoff, Task 2).
- Ports `OrderClient.deleteUncollectedRequests(supplierId)` and `MessageClient.notifyAffected(supplierId)`.
- Scripts `npm run worker` and `npm run worker:dev` → `src/worker/main.ts`; compose service `supplier-worker`.
- `PHOTO_STORE_ENDPOINT=http://host.docker.internal:9000` in development for the API, the worker and `.env.example` (Task 14).
- Relay tick every `1000` ms (the team's "every second").
- Library facts checked against BullMQ's docs/source on 2026-09-30: queue names may not contain `:` (constructor throws); Redis keys are `<prefix>:<queue-name>:<type>`; custom backoff is `settings.backoffStrategy(attemptsMade, type, err, job)` on the Worker with `backoff: { type: 'custom' }` on the job; a failure is final when `attemptsMade + 1 >= attempts` or the error is an `UnrecoverableError`; `worker.close()` stops taking jobs and waits for the active one; custom job ids cannot contain `:` or be digits-only, and a duplicate id is silently ignored; `queue.upsertJobScheduler(id, { every: ms }, { name, data, opts })` creates a repeating job, and "the scheduler will only generate new jobs when the last job begins processing", so missed ticks do not pile up while the worker is busy or down.

## Readings still to confirm

The plan follows the reading shown; if the team says otherwise, only the named task changes.

1. **Outbox table DDL (Task 3).** **Column types confirmed by the team (round 5).** The team named the columns; the plan writes them as `outbox (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (id))`. The column names and types mirror `dead_letter_jobs` (`task_name`, `payload`) and `supplier.version` (`BIGINT UNSIGNED`). No `created_on`, no extra index (the table is normally empty or tiny). The queue is not stored: it is derived from `task_name` in code (`image_cleanup` → `queue:image:cleanup`, `supplier_suspension` → `queue:supplier:suspension`).
2. **Which version is stored (Tasks 4, 7).** The supplier's version **after** the write: delete = read back in the same transaction; PUT/reactivation = the submitted `version + 1`. Every outbox row written by one transaction carries the same version (a PUT that removes three photos writes three rows with one version; `id` orders them).
3. **Relay and ordering (Task 12).** Each tick reads up to 100 rows `ORDER BY version ASC, id ASC`, enqueues them one at a time in that order, deleting each row right after its enqueue succeeds, and **stops the tick at the first enqueue failure** (row kept, retried next second, failure logged). **This guarantees enqueue order only. It does not guarantee execution order:** a job waiting for a delayed retry lets later jobs in the same queue run first, and the two task queues run independently (concurrency 1 each). BullMQ's `priority` option (1 to 2,097,151, lower runs first, FIFO among equals, jobs without a priority run ahead of all prioritised jobs) could rank *waiting* jobs by supplier version, but it only orders jobs that are waiting at the same moment, so it does not stop a later version running while an earlier one sits in its retry delay. The plan does not set it; the team has been asked (round 5) whether to accept enqueue order, add `priority`, or require a hard per-supplier guarantee. No pair of tasks that exists today depends on order (cleanup jobs delete distinct objects; suspension is independent), so nothing breaks, but strict per-supplier execution order would need more machinery (for example holding later tasks until earlier ones complete, which needs a supplier id on the row). That would be a design change; it is not planned. Ordering by `version` alone across different suppliers is harmless: a low-version row of one supplier can sit ahead of another supplier's rows.
4. **Job id and duplicates (Task 12).** The BullMQ job id is `outbox-<outbox id>`. Outbox ids are never reused, so a crash between "enqueued" and "deleted from outbox" re-enqueues the same id, which BullMQ ignores while the job still exists; after a completed job has been removed (`removeOnComplete`), a re-add would run the handler a second time, which is why the handlers must be idempotent (Task 15). This replaces the earlier random-UUID job ids.
5. **Unroutable rows (Task 12).** An outbox row whose `task_name` has no queue is written to `dead_letter_jobs` (`job_id` `outbox-<id>`) and deleted, in line with "bad jobs go straight to the dead letter"; leaving it would block every later row.
6. **Scheduler (Task 12).** BullMQ job scheduler `outbox-relay`, `every: 1000`, on a dedicated queue `queue:outbox:relay` (prefix `queue:outbox`, name `relay`; the key name was confirmed by the team in round 5), processed by the worker with concurrency 1. Tick jobs use `attempts: 1` and are removed when done or failed. If a tick takes longer than a second the next one waits (single worker). With several worker replicas ticks could overlap; that stays correct (duplicates are ignored by job id, deleting a missing row is a no-op) but could reorder enqueues. The compose file runs one worker.
7. **The API no longer needs Redis for jobs, so a Redis outage no longer affects `DELETE`, `PUT` or reactivation.** They return as soon as MySQL commits. Rows wait in the outbox and drain when Redis and the worker are back. **This changes the recorded text of Arch §8.1** ("the client receives its response once the `is_deleted` update commits and the Redis job is successfully enqueued") and §8.2 steps 5–6; Task 17 records it. The enqueue-failure `500` paths in the Phase 3 update service and in the delete service disappear.
8. **The outbox grows while the worker is down** (deliberate; it drains when the worker starts). No cap or alert is planned.
9. **Queue key mapping (Task 2).** BullMQ forbids `:` in a queue name, so `queue:supplier:suspension` is split at the last colon: prefix `queue:supplier`, name `suspension`. Redis keys become `queue:supplier:suspension:wait`, `:delayed`, `:failed`, etc. Likewise `queue:image:cleanup` → prefix `queue:image`, name `cleanup`.
10. **What "bad job" means (Tasks 10–11).** Unknown job name, or a payload that fails validation → dead-lettered immediately with no retries. A message that is not valid JSON can no longer occur.
11. **Retention (Task 2).** `removeOnComplete: true`. Failed jobs are **kept** in Redis (BullMQ default) so a job whose dead-letter insert failed can still be recovered by hand; the `dead_letter_jobs` row is the visibility record.
12. **One job at a time per queue** (`concurrency: 1`), one `Worker` per queue, all in the one worker process. Shutdown waits for the active job on each.
13. **Reactivation (Task 8).** A POST that matches a soft-deleted row runs the Phase 3 update saga on that row in a new *reactivation* mode: the flags (`is_deleted = FALSE`, `is_active = TRUE`) are set by the **same** `UPDATE` and transaction that applies the edit, so they commit together, after every edit statement has succeeded. (a) Photos submitted replace the existing photos entirely, as already recorded: `photo_ids` = one placeholder per new file, retaining none, so every old photo is excluded and one `image_cleanup` outbox row per removed photo is written in the same transaction. (b) No photos submitted → existing photos are untouched (before, zero photos replaced the set with nothing). (c) `version` is bumped once. (d) The POST's hours are handed to the update service as its JSON string form; no change to update validation. (e) A failure anywhere before the commit (validation, photo upload, the transaction) leaves the supplier soft-deleted and unchanged, so a retry with the same `Idempotency-Key` runs the reactivation again. Because the cleanup rows now commit with the edit, the earlier residual ("reactivation committed but cleanup never queued") is gone.
14. **Compose (Task 14).** `stop_grace_period: 30s` so Docker does not `SIGKILL` an in-flight job after the default 10 s; `init: true`; the worker needs `PORT` and `USER_SERVICE_URL` only because `src/config.ts` validates them at startup.
15. **Old Phase 3 dev queue entries.** Anything already `LPUSH`ed to the old Redis list `queue:image:cleanup` is not read by BullMQ. It is only development data; clear it with `redis-cli DEL queue:image:cleanup`.
16. **Photo-store endpoint (Task 14).** With the API and the worker both using `http://host.docker.internal:9000`, stored `photo_location` values start with the prefix `keyOf` expects. Rows uploaded earlier with a `http://localhost:9000/…` prefix (development data) will still be rejected by the worker with "Not a photo in this bucket" and dead-lettered; re-upload or clear them.
17. **Existing databases (Task 3).** The compose MySQL volume only runs `init.sql` on first start. The new table is added to `init.sql` with `CREATE TABLE IF NOT EXISTS`, so `npm run migrate` (which re-applies the file and is safe to re-run) creates it on an existing database. No new migration script is planned.

## File structure

| File | Action | Responsibility |
| --- | --- | --- |
| `package.json` | modify | `bullmq` dependency; `worker`, `worker:dev` scripts (no header possible; list in log) |
| `src/queue/tasks.ts` | create | `OutboxTask`, suspension constants, task builders, task→queue routing |
| `src/queue/bullQueue.ts` | create | Key split, retry policy, BullMQ producer adapter (used by the relay) |
| `src/queue/jobQueue.ts`, `src/queue/photoDeletionJob.ts` | modify | Keep `Job`/`JobQueue` and the photo constants; remove the Redis `LPUSH` adapter and the old job builder |
| `src/db/init.sql` | modify | `outbox` table |
| `src/persistence/outboxRepository.ts`, `mysqlOutboxRepository.ts` | create | Relay's read/delete of outbox rows |
| `src/persistence/outboxWriter.ts` | create | Insert outbox rows inside a write transaction |
| `src/persistence/supplierWriteRepository.ts` | modify | `softDelete(…, tasks)`; `SupplierChange.reactivate` and `onPhotosRemoved`; remove `reactivateSupplier` |
| `src/persistence/mysqlSupplierWriteRepository.ts` | modify | Implement them |
| `src/business/supplierDeletionService.ts` | create | Soft delete with the suspension task, `404` mapping |
| `src/business/supplierUpdateService.ts` | modify | Outbox tasks for removed photos (no queue); optional reactivation mode |
| `src/business/supplierCreationService.ts` | modify | Reactivation delegates to the update service |
| `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts` | modify | `remove` handler, `DELETE /:id` |
| `src/app.ts` | modify | Deletion service; no job queue; creation depends on update |
| `src/persistence/deadLetterRepository.ts`, `mysqlDeadLetterRepository.ts` | create | `dead_letter_jobs` insert |
| `src/worker/downstream.ts` | create | `OrderClient`/`MessageClient` ports + logging mocks |
| `src/worker/handlers.ts` | create | `image_cleanup` and `supplier_suspension` handlers |
| `src/worker/jobProcessor.ts` | create | Route by job name, dead-letter, rethrow |
| `src/worker/outboxRelay.ts` | create | One relay tick: read, enqueue, delete |
| `src/worker/startRelay.ts` | create | BullMQ job scheduler + worker that runs the relay every second |
| `src/worker/startWorkers.ts` | create | One BullMQ `Worker` per task queue |
| `src/worker/main.ts` | create | Process entrypoint, signals, wiring |
| `src/config.ts`, `.env.example` | modify | Optional `MOCK_DOWNSTREAM_FAILURE`; photo-store endpoint default |
| `../compose.yaml` | modify | `supplier-worker` service; photo-store env on `supplier-service` |
| tests | create/modify/delete | one `test/**/*.test.ts` per new source file |
| `README.md`, `SupplierServiceSpec.md`, `SupplierServiceArchitecture.md`, `../ai/usage-log.md`, `../README.md` | modify | Docs and disclosure |

---

### Task 1: Task definitions and routing

**Files:** Create `src/queue/tasks.ts`; Test `test/queue/tasks.test.ts`

- [ ] **Step 1: Write the failing test** — `test/queue/tasks.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
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
```

- [ ] **Step 2: Run** `npx vitest run test/queue/tasks.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/queue/tasks.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
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
```

- [ ] **Step 4: Run** the same command — Expected: PASS (4 tests).
- [ ] **Step 5: Commit** — `git add src/queue/tasks.ts test/queue/tasks.test.ts && git commit -m "feat(supplier-service): add outbox task builders and routing"`

---

### Task 2: BullMQ producer adapter (used by the relay)

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/queue/bullQueue.ts`; Test `test/queue/bullQueue.test.ts`

(The Phase 3 `LPUSH` producer is left in place until Task 7, when its last user goes away.)

- [ ] **Step 1: Install** — `npm install bullmq`. Note the installed version (`npm ls bullmq`) for the log; `upsertJobScheduler` (Task 12) needs a release that has job schedulers. `package.json` and `package-lock.json` change; neither can carry a header.

- [ ] **Step 2: Write the failing test** — `test/queue/bullQueue.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the BullMQ producer adapter and retry policy (Phase 4 plan Task 2). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_JOB_OPTIONS,
  backoffStrategy,
  createBullJobQueue,
  splitQueueKey,
} from '../../src/queue/bullQueue.js';

describe('splitQueueKey', () => {
  it('splits at the last colon so the team key stays the key base', () => {
    expect(splitQueueKey('queue:image:cleanup')).toEqual({ prefix: 'queue:image', name: 'cleanup' });
    expect(splitQueueKey('queue:supplier:suspension')).toEqual({ prefix: 'queue:supplier', name: 'suspension' });
  });

  it('rejects a key with no group or no name', () => {
    expect(() => splitQueueKey('nocolon')).toThrow();
    expect(() => splitQueueKey(':name')).toThrow();
    expect(() => splitQueueKey('group:')).toThrow();
  });
});

describe('retry policy', () => {
  it('waits 5 s, 25 s, 125 s, 625 s after the 1st..4th failed attempt', () => {
    expect([1, 2, 3, 4].map(backoffStrategy)).toEqual([5000, 25000, 125000, 625000]);
  });

  it('allows 5 attempts with the custom backoff and drops completed jobs', () => {
    expect(DEFAULT_JOB_OPTIONS).toMatchObject({ attempts: 5, backoff: { type: 'custom' }, removeOnComplete: true });
  });
});

describe('bull job queue', () => {
  function build() {
    const queues: Array<{ key: string; add: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const queue = createBullJobQueue({ host: 'h', port: 1 }, (key) => {
      const fake = { key, add: vi.fn().mockResolvedValue({}), close: vi.fn().mockResolvedValue(undefined) };
      queues.push(fake);
      return fake;
    });
    return { queue, queues };
  }

  it('adds the job with task_name as name, payload as data and id as jobId', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'j-1', task_name: 't', payload: { a: 1 } });
    expect(queues[0]?.add).toHaveBeenCalledWith('t', { a: 1 }, { jobId: 'j-1' });
  });

  it('creates one BullMQ queue per key and reuses it', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'a', task_name: 't', payload: {} });
    await queue.enqueue('queue:image:cleanup', { id: 'b', task_name: 't', payload: {} });
    await queue.enqueue('queue:supplier:suspension', { id: 'c', task_name: 't', payload: {} });
    expect(queues.map((q) => q.key)).toEqual(['queue:image:cleanup', 'queue:supplier:suspension']);
  });

  it('lets a Redis failure propagate', async () => {
    const queue = createBullJobQueue({ host: 'h', port: 1 }, () => ({
      add: vi.fn().mockRejectedValue(new Error('down')),
      close: vi.fn(),
    }));
    await expect(queue.enqueue('queue:image:cleanup', { id: 'j', task_name: 't', payload: {} })).rejects.toThrow('down');
  });

  it('closes every queue it created', async () => {
    const { queue, queues } = build();
    await queue.enqueue('queue:image:cleanup', { id: 'a', task_name: 't', payload: {} });
    await queue.close();
    expect(queues[0]?.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run** `npx vitest run test/queue/bullQueue.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement** — `src/queue/bullQueue.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: BullMQ producer adapter and retry policy (Phase 4 plan Task 2), per the team's decision to
 *        use BullMQ (2026-09-30). Queue keys, attempts and delays are the team-supplied values. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import type { JobQueue } from './jobQueue.js';

/**
 * Team keys look like 'queue:<group>:<name>'. BullMQ forbids ':' in a queue name, so the last
 * segment is the name and the rest is the key prefix; keys stay under e.g. queue:image:cleanup:*.
 */
export function splitQueueKey(queueKey: string): { prefix: string; name: string } {
  const at = queueKey.lastIndexOf(':');
  if (at <= 0 || at === queueKey.length - 1) {
    throw new Error(`Queue key must look like "group:name": ${queueKey}`);
  }
  return { prefix: queueKey.slice(0, at), name: queueKey.slice(at + 1) };
}

export const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5_000;
const RETRY_FACTOR = 5;

/** Delay before the next attempt once `attemptsMade` attempts have failed: 5 s, 25 s, 125 s, 625 s. */
export function backoffStrategy(attemptsMade: number): number {
  return RETRY_BASE_DELAY_MS * RETRY_FACTOR ** (attemptsMade - 1);
}

/** Retries are delayed jobs held in Redis with a timestamp, so no worker sleeps between attempts. */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'custom' },
  removeOnComplete: true,
};

interface QueueLike {
  add(name: string, data: unknown, opts?: JobsOptions): Promise<unknown>;
  close(): Promise<void>;
}

export type QueueFactory = (queueKey: string) => QueueLike;

export function createBullJobQueue(
  connection: ConnectionOptions,
  makeQueue: QueueFactory = (queueKey) => {
    const { prefix, name } = splitQueueKey(queueKey);
    return new Queue(name, { connection, prefix, defaultJobOptions: DEFAULT_JOB_OPTIONS });
  },
): JobQueue & { close(): Promise<void> } {
  const queues = new Map<string, QueueLike>();

  function queueFor(queueKey: string): QueueLike {
    let queue = queues.get(queueKey);
    if (queue === undefined) {
      queue = makeQueue(queueKey);
      queues.set(queueKey, queue);
    }
    return queue;
  }

  return {
    async enqueue(queueKey, job) {
      await queueFor(queueKey).add(job.task_name, job.payload, { jobId: job.id });
    },
    async close() {
      await Promise.all([...queues.values()].map((queue) => queue.close()));
    },
  };
}
```

- [ ] **Step 5: Run** `npx vitest run test/queue` and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS. If `tsc` rejects `new Queue(...)` as a `QueueLike`, loosen `QueueLike.add`'s `name` type to match BullMQ's generic and re-run; behaviour unchanged.

- [ ] **Step 6: Commit** — `git add package.json package-lock.json src/queue/bullQueue.ts test/queue/bullQueue.test.ts && git commit -m "feat(supplier-service): add BullMQ producer adapter and retry policy"`

---

### Task 3: Outbox table, repositories and the transactional writer

**Files:**
- Modify: `src/db/init.sql` (append a header pair; add the table as the last statement)
- Create: `src/persistence/outboxRepository.ts`, `src/persistence/mysqlOutboxRepository.ts`, `src/persistence/outboxWriter.ts`
- Test: `test/persistence/mysqlOutboxRepository.test.ts`, `test/persistence/outboxWriter.test.ts`

- [ ] **Step 1: Write the failing tests.** `test/persistence/mysqlOutboxRepository.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the outbox table DDL and the relay-side outbox repository (Phase 4 plan Task 3).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { readFileSync } from 'node:fs';
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlOutboxRepository } from '../../src/persistence/mysqlOutboxRepository.js';

describe('outbox table', () => {
  it('is created by init.sql with the columns the team named', () => {
    const sql = readFileSync(new URL('../../src/db/init.sql', import.meta.url), 'utf8').replace(/\s+/g, ' ');
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS outbox (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (id));',
    );
  });
});

describe('mysql outbox repository', () => {
  it('reads the oldest rows first: supplier version, then id', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        { id: 4, task_name: 'supplier_suspension', payload: { supplier_id: 1 }, version: 6 },
        { id: 5, task_name: 'image_cleanup', payload: '{"photo_id":7,"photo_location":"loc"}', version: 6 },
      ],
      [],
    ]);

    const rows = await createMysqlOutboxRepository({ query } as unknown as Pool).fetchBatch(100);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'SELECT id, task_name, payload, version FROM outbox ORDER BY version ASC, id ASC LIMIT ?',
    );
    expect(params).toEqual([100]);
    expect(rows).toEqual([
      { id: 4, taskName: 'supplier_suspension', payload: { supplier_id: 1 }, version: 6 },
      { id: 5, taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc' }, version: 6 },
    ]);
  });

  it('deletes a row by id', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    await createMysqlOutboxRepository({ query } as unknown as Pool).delete(4);
    expect(query).toHaveBeenCalledWith('DELETE FROM outbox WHERE id = ?', [4]);
  });
});
```

`test/persistence/outboxWriter.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the transactional outbox writer (Phase 4 plan Task 3). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PoolConnection } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { insertOutboxRows } from '../../src/persistence/outboxWriter.js';

describe('insertOutboxRows', () => {
  it('inserts one row per task, all with the given supplier version, in a single statement', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    await insertOutboxRows({ query } as unknown as PoolConnection, 6, [
      { taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'a' } },
      { taskName: 'image_cleanup', payload: { photo_id: 8, photo_location: 'b' } },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('INSERT INTO outbox (task_name, payload, version) VALUES ?');
    expect(params).toEqual([
      [
        ['image_cleanup', '{"photo_id":7,"photo_location":"a"}', 6],
        ['image_cleanup', '{"photo_id":8,"photo_location":"b"}', 6],
      ],
    ]);
  });

  it('does nothing for an empty task list', async () => {
    const query = vi.fn();
    await insertOutboxRows({ query } as unknown as PoolConnection, 6, []);
    expect(query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/persistence/mysqlOutboxRepository.test.ts test/persistence/outboxWriter.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** `src/db/init.sql` — append, as the last line (one statement per line like the rest of the file) and add a header pair to the file's comment block:

```sql
CREATE TABLE IF NOT EXISTS outbox (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, task_name VARCHAR(255) NOT NULL, payload JSON NOT NULL, version BIGINT UNSIGNED NOT NULL, PRIMARY KEY (id));
```

`src/persistence/outboxRepository.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: OutboxRepository port for the relay (Phase 4 plan Task 3); columns per the team's answer of
 *        2026-09-30. No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
export interface OutboxRow {
  id: number;
  /** The Redis task name (also selects the queue). */
  taskName: string;
  /** The original job payload. */
  payload: unknown;
  /** The supplier version written by the same transaction. */
  version: number;
}

export interface OutboxRepository {
  /** Up to `limit` rows, lowest supplier version first, then lowest id. */
  fetchBatch(limit: number): Promise<OutboxRow[]>;
  delete(id: number): Promise<void>;
}
```

`src/persistence/mysqlOutboxRepository.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: MySQL implementation of OutboxRepository (Phase 4 plan Task 3). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { OutboxRepository } from './outboxRepository.js';

export function createMysqlOutboxRepository(pool: Pool): OutboxRepository {
  return {
    async fetchBatch(limit) {
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, task_name, payload, version FROM outbox ORDER BY version ASC, id ASC LIMIT ?',
        [limit],
      );
      return rows.map((row) => ({
        id: Number(row.id),
        taskName: String(row.task_name),
        // mysql2 normally parses JSON columns; tolerate a string in case the driver returns raw text.
        payload: typeof row.payload === 'string' ? (JSON.parse(row.payload) as unknown) : row.payload,
        version: Number(row.version),
      }));
    },

    async delete(id) {
      await pool.query('DELETE FROM outbox WHERE id = ?', [id]);
    },
  };
}
```

`src/persistence/outboxWriter.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Writes outbox rows inside a caller's transaction (Phase 4 plan Task 3), so a supplier write
 *        and its background tasks commit together (team answer, 2026-09-30). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { PoolConnection } from 'mysql2/promise';
import type { OutboxTask } from '../queue/tasks.js';

/** Inserts one outbox row per task, all stamped with the supplier version this transaction writes. */
export async function insertOutboxRows(conn: PoolConnection, version: number, tasks: OutboxTask[]): Promise<void> {
  if (tasks.length === 0) return;
  await conn.query('INSERT INTO outbox (task_name, payload, version) VALUES ?', [
    tasks.map((task) => [task.taskName, JSON.stringify(task.payload), version]),
  ]);
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS (5 tests).
- [ ] **Step 5: Commit** — `git add src/db/init.sql src/persistence/outboxRepository.ts src/persistence/mysqlOutboxRepository.ts src/persistence/outboxWriter.ts test/persistence && git commit -m "feat(supplier-service): add the outbox table, repository and transactional writer"`

---

### Task 4: Repository `softDelete` (writes the suspension task in the same transaction)

**Files:** Modify `src/persistence/supplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.ts`, `test/persistence/mysqlSupplierWriteRepository.test.ts`, and every test fake typed as `SupplierWriteRepository` (`grep -rn "SupplierWriteRepository" test` — add `softDelete: vi.fn()` so `tsc` passes).

- [ ] **Step 1: Write the failing test** — append to `test/persistence/mysqlSupplierWriteRepository.test.ts` (uses the file's existing `fakePool` and `sqls` helpers)

```ts
describe('softDelete', () => {
  const now = '2026-09-30 10:00:00';
  const tasks = [{ taskName: 'supplier_suspension', payload: { supplier_id: 7 } }];

  it('updates the row and writes the outbox rows, stamped with the new supplier version, in one transaction', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ version: 6 }], {}]);

    const changed = await createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks);

    expect(changed).toBe(true);
    expect(sqls(conn)).toEqual([
      'UPDATE supplier SET is_deleted = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND is_deleted = FALSE',
      'SELECT version FROM supplier WHERE supplier_id = ?',
      'INSERT INTO outbox (task_name, payload, version) VALUES ?',
    ]);
    expect(conn.query.mock.calls[0]?.[1]).toEqual([now, 7]);
    expect(conn.query.mock.calls[2]?.[1]).toEqual([[['supplier_suspension', '{"supplier_id":7}', 6]]]);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  it('rolls back, committing neither the delete nor the outbox row, when the outbox insert fails', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ version: 6 }], new Error('outbox insert failed')]);

    await expect(createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks)).rejects.toThrow(
      'outbox insert failed',
    );

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  it('returns false and writes no outbox row when no live row matched (unknown or already deleted)', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 0 }]);

    expect(await createMysqlSupplierWriteRepository(pool).softDelete(7, now, tasks)).toBe(false);
    expect(sqls(conn)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/persistence/mysqlSupplierWriteRepository.test.ts` — Expected: FAIL (`softDelete is not a function`).

- [ ] **Step 3: Implement.** `supplierWriteRepository.ts` (+ header pair): add the import `import type { OutboxTask } from '../queue/tasks.js';` and the interface method:

```ts
  /**
   * Soft delete (Arch §6.2, §8.1), in one transaction: sets is_deleted, updated_on and version on a
   * row that is not already deleted (is_active untouched) and writes `tasks` to the outbox, stamped
   * with the new supplier version, before committing. Returns false, writing nothing, when no live
   * row matched (unknown or already soft-deleted).
   */
  softDelete(supplierId: number, now: string, tasks: OutboxTask[]): Promise<boolean>;
```

`mysqlSupplierWriteRepository.ts` (+ header pair): `import { insertOutboxRows } from './outboxWriter.js';` and `import type { OutboxTask } ...` is not needed there; add inside the returned object:

```ts
    async softDelete(supplierId, now, tasks) {
      return inTransaction(async (conn) => {
        const [result] = await conn.query<ResultSetHeader>(
          `UPDATE supplier SET is_deleted = TRUE, updated_on = ?, version = version + 1
           WHERE supplier_id = ? AND is_deleted = FALSE`,
          [now, supplierId],
        );
        if (result.affectedRows === 0) return false;
        const [rows] = await conn.query<RowDataPacket[]>('SELECT version FROM supplier WHERE supplier_id = ?', [supplierId]);
        const row = rows[0];
        if (row === undefined) throw new Error(`Supplier ${supplierId} vanished inside its own transaction.`);
        await insertOutboxRows(conn, Number(row.version), tasks);
        return true;
      });
    },
```

- [ ] **Step 4: Run** `npx vitest run test/persistence` and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/persistence test && git commit -m "feat(supplier-service): add transactional soft-delete with outbox rows"`

---

### Task 5: Deletion service

**Files:** Create `src/business/supplierDeletionService.ts`; Test `test/business/supplierDeletionService.test.ts`

- [ ] **Step 1: Write the failing test** — `test/business/supplierDeletionService.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the supplier deletion service (Phase 4 plan Task 5). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createSupplierDeletionService } from '../../src/business/supplierDeletionService.js';

function build(softDelete = vi.fn().mockResolvedValue(true)) {
  const service = createSupplierDeletionService({
    repo: { softDelete },
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { service, softDelete };
}

describe('deleteSupplier', () => {
  it('soft-deletes with the Singapore time, hands the suspension task to the same transaction, and answers 200 with id', async () => {
    const { service, softDelete } = build();

    const result = await service.deleteSupplier(101);

    expect(softDelete).toHaveBeenCalledWith(101, '2026-09-30 10:00:00', [
      { taskName: 'supplier_suspension', payload: { supplier_id: 101 } },
    ]);
    expect(result).toEqual({ statusCode: 200, body: { id: 101, isDeleted: true } });
  });

  it('answers 404 when no live row matched (repeat DELETE, unknown id)', async () => {
    const { service } = build(vi.fn().mockResolvedValue(false));
    await expect(service.deleteSupplier(9)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets a database failure propagate', async () => {
    const { service } = build(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(service.deleteSupplier(101)).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/business/supplierDeletionService.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/business/supplierDeletionService.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Supplier soft-delete workflow (Phase 4 plan Task 5); SupplierServiceArchitecture.md §7.5,
 *        §8.1. The suspension task is committed to the outbox by the same transaction as the delete
 *        (team answer, 2026-09-30). No requirements, architecture, schema, or API decisions were made
 *        by the AI tool.
 * Author review:
 */
import type { SupplierWriteRepository } from '../persistence/supplierWriteRepository.js';
import { buildSuspensionTask } from '../queue/tasks.js';
import { AppError } from '../utils/AppError.js';
import { sgtDatetime } from '../utils/time.js';

export interface DeleteResult {
  statusCode: 200;
  body: { id: number; isDeleted: true };
}

interface Dependencies {
  repo: Pick<SupplierWriteRepository, 'softDelete'>;
  clock?: () => Date;
}

export function createSupplierDeletionService({ repo, clock = () => new Date() }: Dependencies) {
  return {
    async deleteSupplier(supplierId: number): Promise<DeleteResult> {
      // The delete and its outbox row commit together; the relay enqueues the job afterwards.
      // A row that is unknown or already soft-deleted matches nothing: repeated DELETE → 404 (Arch §7.5).
      const changed = await repo.softDelete(supplierId, sgtDatetime(clock()), [buildSuspensionTask(supplierId)]);
      if (!changed) throw new AppError(404, 'Not Found', 'Supplier not found.');

      // Answered without waiting for the worker (Arch §8.1).
      return { statusCode: 200, body: { id: supplierId, isDeleted: true } };
    },
  };
}

export type SupplierDeletionService = ReturnType<typeof createSupplierDeletionService>;
```

- [ ] **Step 4: Run** the same command — Expected: PASS (3 tests).
- [ ] **Step 5: Commit** — `git add src/business/supplierDeletionService.ts test/business/supplierDeletionService.test.ts && git commit -m "feat(supplier-service): add supplier soft-delete service"`

---

### Task 6: `DELETE /:id` route, controller and app wiring

**Files:** Modify `src/controllers/adminSupplier.controller.ts`, `src/routes/adminSupplier.routes.ts`, `src/app.ts` (header pair on each), `test/routes/adminSupplier.routes.test.ts`

- [ ] **Step 1: Write the failing tests** — in `test/routes/adminSupplier.routes.test.ts` add a `deletion` fake to `buildApp`, pass it to the router, return it, import its type, then append the describe:

```ts
  const deletion = {
    deleteSupplier: vi.fn().mockResolvedValue({ statusCode: 200, body: { id: 101, isDeleted: true } }),
  };
```
```ts
      deletion: deletion as unknown as SupplierDeletionService,
```
(`return { app, service, creation, update, deletion, idempotency };` and `import type { SupplierDeletionService } from '../../src/business/supplierDeletionService.js';`)

```ts
describe('DELETE /:id', () => {
  it.each(['admin', 'super admin'])('lets %s soft-delete and returns the service body', async (role) => {
    const { app, deletion } = buildApp();
    const res = await request(app).delete('/api/v1/admin/suppliers/101').set('x-test-role', role);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 101, isDeleted: true });
    expect(deletion.deleteSupplier).toHaveBeenCalledWith(101);
  });

  it('rejects the user role with 403 and never reaches the service', async () => {
    const { app, deletion } = buildApp();
    const res = await request(app).delete('/api/v1/admin/suppliers/101').set('x-test-role', 'user');
    expect(res.status).toBe(403);
    expect(deletion.deleteSupplier).not.toHaveBeenCalled();
  });

  it('maps a 404 from the service', async () => {
    const { app, deletion } = buildApp();
    deletion.deleteSupplier.mockRejectedValueOnce(new AppError(404, 'Not Found', 'Supplier not found.'));
    const res = await request(app).delete('/api/v1/admin/suppliers/9').set('x-test-role', 'admin');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/routes/adminSupplier.routes.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Controller: `import type { SupplierDeletionService } from '../business/supplierDeletionService.js';`, add `deletion: SupplierDeletionService;` to `AdminSupplierDependencies`, destructure `deletion`, add after `update`:

```ts
    remove: asyncHandler(async (req, res) => {
      const { id } = parseOrThrow(idParamSchema, req.params, 'path');
      const result = await deletion.deleteSupplier(id);
      res.status(result.statusCode).json(result.body);
    }),
```
Routes, after the `PUT`:

```ts
  // DELETE is idempotent by design (a repeat returns 404), so no idempotency middleware (Arch §7.5).
  router.delete('/:id', controller.remove);
```
`app.ts`: import `createSupplierDeletionService`, and add to the router options `deletion: createSupplierDeletionService({ repo: writeRepository }),`.

- [ ] **Step 4: Run** `npx vitest run test/routes test/app.integration.test.ts` and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/controllers src/routes src/app.ts test/routes && git commit -m "feat(supplier-service): add admin supplier DELETE endpoint"`

---

### Task 7: The update saga writes its cleanup tasks to the outbox (the API stops using a job queue)

Moves the Phase 3 post-commit enqueue of excluded-photo cleanup jobs into the update transaction. After this task nothing in the API process touches Redis job queues.

**Files:** Modify `src/persistence/supplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.ts`, `src/business/supplierUpdateService.ts`, `src/app.ts`, `src/queue/jobQueue.ts`, `src/queue/photoDeletionJob.ts`; tests `test/persistence/mysqlSupplierWriteRepository.test.ts`, `test/business/supplierUpdateService.test.ts`; delete `test/queue/jobQueue.test.ts`.

- [ ] **Step 1: Write the failing tests.**

Repository — append to `test/persistence/mysqlSupplierWriteRepository.test.ts` (import `buildPhotoCleanupTask` from `../../src/queue/tasks.js`):

```ts
describe('updateSupplier outbox rows', () => {
  const now = '2026-09-30 10:00:00';
  const onPhotosRemoved = (removed: Array<{ photoId: number; location: string }>) => removed.map(buildPhotoCleanupTask);

  it('writes one image_cleanup outbox row per removed photo, stamped with the bumped supplier version, before committing', async () => {
    // supplier UPDATE, SELECT photos, DELETE removed photos, shift display_order, outbox INSERT
    const { pool, conn } = fakePool([
      { affectedRows: 1 },
      [{ photo_id: 7, photo_location: 'loc-7' }],
      {},
      {},
      {},
    ]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, {
      version: 3,
      now,
      photos: [],
      onPhotosRemoved,
    });

    const calls = sqls(conn);
    expect(calls.at(-1)).toBe('INSERT INTO outbox (task_name, payload, version) VALUES ?');
    expect(conn.query.mock.calls.at(-1)?.[1]).toEqual([
      [['image_cleanup', '{"photo_id":7,"photo_location":"loc-7"}', 4]],
    ]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('writes no outbox row when no photo was removed', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [], {}]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [], onPhotosRemoved });

    expect(sqls(conn).some((sql) => sql.startsWith('INSERT INTO outbox'))).toBe(false);
  });

  it('writes no outbox row when the caller supplies no onPhotosRemoved', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, [{ photo_id: 7, photo_location: 'loc-7' }], {}, {}]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [] });

    expect(sqls(conn).some((sql) => sql.startsWith('INSERT INTO outbox'))).toBe(false);
  });

  it('rolls back the edit when the outbox insert fails', async () => {
    const { pool, conn } = fakePool([
      { affectedRows: 1 },
      [{ photo_id: 7, photo_location: 'loc-7' }],
      {},
      {},
      new Error('outbox insert failed'),
    ]);

    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, photos: [], onPhotosRemoved }),
    ).rejects.toThrow('outbox insert failed');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
```

Update service — in `test/business/supplierUpdateService.test.ts`: (1) remove the `queue` dependency from every `createSupplierUpdateService({...})` call and from any helper; (2) delete every test that asserts `queue.enqueue` was called or that a failed enqueue returns `500`/"Photo cleanup could not be queued" (find with `grep -n "enqueue\|queue" test/business/supplierUpdateService.test.ts`); (3) add the tests below, using that file's existing builder for a live supplier (read it first; it already exposes `repo.updateSupplier` and the current photos — adapt the names, keep the assertions):

```ts
  it('hands the repository a builder of image_cleanup outbox tasks when the photo set is edited', async () => {
    // isPhotoDirty true with photo_ids [] and no files: every current photo is excluded
    await service.updateSupplier(5, { version: 3, isPhotoDirty: true, photoIds: [], placeholderIds: [] }, []);
    const change = repo.updateSupplier.mock.calls[0]?.[1] as { onPhotosRemoved?: (p: Array<{ photoId: number; location: string }>) => unknown };
    expect(change.onPhotosRemoved?.([{ photoId: 7, location: 'loc-7' }])).toEqual([
      { taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc-7' } },
    ]);
  });

  it('does not ask for outbox tasks when the photos are not edited', async () => {
    await service.updateSupplier(5, { version: 3, name: 'New name', isPhotoDirty: false }, []);
    expect(repo.updateSupplier.mock.calls[0]?.[1]).not.toHaveProperty('onPhotosRemoved');
  });
```
and delete the file `test/queue/jobQueue.test.ts` (`git rm`); its cases are covered by `tasks.test.ts` and `bullQueue.test.ts`.

- [ ] **Step 2: Run** `npx vitest run test/persistence test/business/supplierUpdateService.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`supplierWriteRepository.ts` (+ header pair) — add to `SupplierChange` (import `OutboxTask` if not already imported):

```ts
  /**
   * Called inside the update transaction with the photo rows the edit deleted; the tasks it returns
   * are written to the outbox in that same transaction (Arch §8.2; team answer 2026-09-30).
   */
  onPhotosRemoved?: (removed: CurrentPhoto[]) => OutboxTask[];
```

`mysqlSupplierWriteRepository.ts` (+ header pair) — at the end of the `if (change.photos !== undefined) { … }` block's enclosing transaction body, just before `return { removedPhotos };`, add:

```ts
          if (change.onPhotosRemoved !== undefined) {
            await insertOutboxRows(conn, change.version + 1, change.onPhotosRemoved(removedPhotos));
          }
```
(`insertOutboxRows` was imported in Task 4. `removedPhotos` is the array the block already builds; it stays empty when photos are untouched, and `insertOutboxRows` ignores an empty list.)

`supplierUpdateService.ts` (+ header pair) — remove the `queue: JobQueue` dependency and the imports `JobQueue`, `PHOTO_DELETION_QUEUE_KEY`, `buildPhotoDeletionJob`; add `import { buildPhotoCleanupTask } from '../queue/tasks.js';`; where the photo plan is applied set the hook:

```ts
      if (plan !== null) {
        change.photos = plan.entries.map(
          (entry): PhotoWrite =>
            entry.kind === 'existing'
              ? { kind: 'existing', photoId: entry.photoId }
              : { kind: 'new', location: uploaded[entry.fileIndex] as string },
        );
        change.onPhotosRemoved = (removed) => removed.map(buildPhotoCleanupTask);
      }
```
and replace the transaction-and-enqueue section with just the transaction (delete the whole "Steps 5-6 … enqueue" block):

```ts
      // Steps 3-4: one transaction (edit + outbox rows); on failure remove the new cloud objects.
      try {
        await repo.updateSupplier(supplierId, change);
      } catch (error) {
        await removeUploaded(uploaded);
        if (error instanceof AppError) throw error;
        throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');
      }

      return { statusCode: 200, body: await reader.getAdminSupplier(supplierId) };
```

`src/app.ts` (+ header pair) — delete the `createRedisJobQueue` import and the `queue: createRedisJobQueue(redis)` line from the `createSupplierUpdateService` call (keep the `redis` import; the idempotency store still uses it).

`src/queue/jobQueue.ts` (+ header pair) — delete `createRedisJobQueue` and `import type { Redis } from 'ioredis'`; keep `Job` and `JobQueue`. `src/queue/photoDeletionJob.ts` (+ header pair) — delete `buildPhotoDeletionJob`, the `randomUUID` import and the `Job` import; keep the two constants.

- [ ] **Step 4: Run** `npx vitest run` (whole suite) and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS; fix any remaining reference to the removed symbols (`grep -rn "buildPhotoDeletionJob\|createRedisJobQueue" src test`).
- [ ] **Step 5: Commit** — `git add -A src test && git commit -m "feat(supplier-service): write excluded-photo cleanup tasks to the outbox in the update transaction"`

---

### Task 8: Reactivation = the edit cycle, with the flag restore committed by the same transaction

Replaces the Phase 2 behaviour (one transaction that replaced description, categories, hours and photo rows) and removes `reactivateSupplier`. The edit is attempted first; the flags are part of the same `UPDATE` inside the edit's transaction, so they only commit if every edit statement succeeded (reading 13). The cleanup tasks for replaced photos are outbox rows in that same transaction (Task 7).

**Files:** Modify `src/persistence/supplierWriteRepository.ts`, `src/persistence/mysqlSupplierWriteRepository.ts`, `src/business/supplierUpdateService.ts`, `src/business/supplierCreationService.ts`, `src/app.ts`; tests `test/persistence/mysqlSupplierWriteRepository.test.ts`, `test/business/supplierUpdateService.test.ts`, `test/business/supplierCreationService.test.ts`, `test/business/supplierCreation.minio.test.ts`, plus any fake found with `grep -rn "reactivat" test`.

- [ ] **Step 1: Write the failing tests.**

Repository — delete the three existing `reactivateSupplier` tests in `test/persistence/mysqlSupplierWriteRepository.test.ts` and add:

```ts
describe('updateSupplier in reactivation mode', () => {
  const now = '2026-09-30 10:00:00';

  it('matches a soft-deleted row and restores the flags in the same UPDATE as the edit', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, {
      version: 3,
      now,
      name: 'Campus Store',
      reactivate: true,
    });

    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, is_deleted = FALSE, is_active = TRUE, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = TRUE',
    );
    expect(conn.query.mock.calls[0]?.[1]).toEqual(['Campus Store', now, 5, 3]);
    expect(conn.commit).toHaveBeenCalled();
  });

  it('an ordinary update still requires a live row and does not touch the flags', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }]);

    await createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, name: 'Campus Store' });

    expect(sqls(conn)[0]).toBe(
      'UPDATE supplier SET supplier_name = ?, updated_on = ?, version = version + 1 WHERE supplier_id = ? AND version = ? AND is_deleted = FALSE',
    );
  });

  it('rolls back, committing nothing, when a later statement of the edit fails', async () => {
    const { pool, conn } = fakePool([{ affectedRows: 1 }, new Error('category insert failed')]);

    await expect(
      createMysqlSupplierWriteRepository(pool).updateSupplier(5, { version: 3, now, categoryIds: [2], reactivate: true }),
    ).rejects.toThrow('category insert failed');

    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
```

Update service — append to `test/business/supplierUpdateService.test.ts` (add `import type { SupplierWriteRepository } from '../../src/persistence/supplierWriteRepository.js';` and `createSupplierUpdateService`/`vi`/`describe`/`it`/`expect` imports if not already present):

```ts
describe('reactivation mode', () => {
  const edit = {
    version: 3,
    name: 'Campus Store',
    type: 'Store' as const,
    locationId: 4,
    openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
    is24h: false,
    isPhotoDirty: false,
  };

  function build(isDeleted: boolean) {
    const repo = {
      findCurrent: vi.fn().mockResolvedValue({
        supplierId: 5,
        name: 'Old',
        type: 'Store',
        locationId: 4,
        isDeleted,
        version: 3,
        photos: [],
      }),
      locationExists: vi.fn().mockResolvedValue(true),
      findMissingCategoryIds: vi.fn().mockResolvedValue([]),
      findByIdentity: vi.fn().mockResolvedValue({ supplierId: 5, isDeleted }),
      updateSupplier: vi.fn().mockResolvedValue({ removedPhotos: [] }),
    };
    const storage = { upload: vi.fn(), update: vi.fn(), delete: vi.fn(), view: vi.fn() };
    const service = createSupplierUpdateService({
      repo: repo as unknown as SupplierWriteRepository,
      storage,
      reader: { getAdminSupplier: vi.fn().mockResolvedValue({ id: 5 }) },
      clock: () => new Date('2026-09-30T02:00:00Z'),
    });
    return { service, repo };
  }

  it('edits a soft-deleted supplier and asks the repository to restore the flags in the same transaction', async () => {
    const { service, repo } = build(true);
    const result = await service.updateSupplier(5, edit, [], { reactivate: true });
    expect(repo.updateSupplier).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ version: 3, name: 'Campus Store', reactivate: true }),
    );
    expect(result).toEqual({ statusCode: 200, body: { id: 5 } });
  });

  it('answers 422 when the supplier is no longer soft-deleted, and writes nothing', async () => {
    const { service, repo } = build(false);
    await expect(service.updateSupplier(5, edit, [], { reactivate: true })).rejects.toMatchObject({ statusCode: 422 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('an ordinary update of a soft-deleted supplier is still 404', async () => {
    const { service, repo } = build(true);
    await expect(service.updateSupplier(5, edit, [])).rejects.toMatchObject({ statusCode: 404 });
    expect(repo.updateSupplier).not.toHaveBeenCalled();
  });

  it('an ordinary update does not ask for reactivation', async () => {
    const { service, repo } = build(false);
    await service.updateSupplier(5, edit, []);
    expect(repo.updateSupplier.mock.calls[0]?.[1]).not.toHaveProperty('reactivate');
  });

  it('answers 500 when the transaction fails, having changed nothing', async () => {
    const { service, repo } = build(true);
    repo.updateSupplier.mockRejectedValueOnce(new Error('db down'));
    await expect(service.updateSupplier(5, edit, [], { reactivate: true })).rejects.toMatchObject({ statusCode: 500 });
  });
});
```

Creation service — delete the existing reactivation tests in `test/business/supplierCreationService.test.ts` (find with `grep -n reactivat`) and add:

```ts
describe('reactivating a soft-deleted supplier', () => {
  const input = {
    name: 'Campus Store',
    type: 'Store' as const,
    desc: 'desc',
    locationId: 4,
    categoryIds: [2],
    hours: [{ day: 1, open: '09:00', close: '18:00', is24h: false }],
  };

  function build(updateFails?: Error) {
    const repo = {
      locationExists: vi.fn().mockResolvedValue(true),
      findMissingCategoryIds: vi.fn().mockResolvedValue([]),
      findByIdentity: vi.fn().mockResolvedValue({ supplierId: 5, isDeleted: true }),
      findCurrent: vi.fn().mockResolvedValue({
        supplierId: 5,
        version: 3,
        name: 'x',
        type: 'Store',
        locationId: 4,
        isDeleted: true,
        photos: [],
      }),
      insertSupplier: vi.fn(),
    };
    const update = {
      updateSupplier: vi.fn(async () => {
        if (updateFails) throw updateFails;
        return { statusCode: 200 as const, body: { id: 5 } };
      }),
    };
    const storage = { upload: vi.fn(), update: vi.fn(), delete: vi.fn(), view: vi.fn() };
    const service = createSupplierCreationService({
      repo: repo as unknown as SupplierWriteRepository,
      storage,
      reader: { getAdminSupplier: vi.fn() },
      update,
      clock: () => new Date('2026-09-30T02:00:00Z'),
    });
    return { service, repo, update, storage };
  }

  it('runs the edit cycle in reactivation mode with the current version, and answers 200', async () => {
    const { service, repo, update } = build();
    const result = await service.createSupplier(input, [], { userId: 'u-1' });

    expect(update.updateSupplier).toHaveBeenCalledWith(
      5,
      {
        version: 3,
        name: 'Campus Store',
        type: 'Store',
        desc: 'desc',
        locationId: 4,
        categoryIds: [2],
        openingHours: '[{"day":1,"open":"09:00","close":"18:00"}]',
        is24h: false,
        isPhotoDirty: false,
      },
      [],
      { reactivate: true },
    );
    expect(result).toEqual({ statusCode: 200, body: { id: 5 } });
    expect(repo.insertSupplier).not.toHaveBeenCalled();
  });

  it('replaces the photos entirely when new ones are submitted (one placeholder per file, none retained)', async () => {
    const { service, update } = build();
    const files = [
      { buffer: Buffer.from('a'), mimeType: 'image/png' as const },
      { buffer: Buffer.from('b'), mimeType: 'image/jpeg' as const },
    ];
    await service.createSupplier(input, files, { userId: 'u-1' });
    const [, edit, passed] = update.updateSupplier.mock.calls[0] as unknown as [number, Record<string, unknown>, unknown[]];
    expect(edit).toMatchObject({ isPhotoDirty: true, photoIds: ['photo-0', 'photo-1'], placeholderIds: ['photo-0', 'photo-1'] });
    expect(passed).toBe(files);
  });

  it('sends a 24/7 Store as is24h true with its day-8 entry', async () => {
    const { service, update } = build();
    await service.createSupplier(
      { ...input, hours: [{ day: 8, open: '00:00', close: '23:59', is24h: true }] },
      [],
      { userId: 'u-1' },
    );
    expect(update.updateSupplier.mock.calls[0]?.[1]).toMatchObject({
      is24h: true,
      openingHours: '[{"day":8,"open":"00:00","close":"23:59"}]',
    });
  });

  it('never uploads photos itself; the edit cycle does', async () => {
    const { service, storage } = build();
    await service.createSupplier(input, [{ buffer: Buffer.from('a'), mimeType: 'image/png' }], { userId: 'u-1' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('propagates an edit failure unchanged', async () => {
    const { service } = build(new Error('boom'));
    await expect(service.createSupplier(input, [], { userId: 'u-1' })).rejects.toThrow('boom');
  });
});
```

(The creation test file needs `import type { SupplierWriteRepository } from '../../src/persistence/supplierWriteRepository.js';` and `vi` if not already imported. Existing create-path tests in the file and `test/business/supplierCreation.minio.test.ts` must also pass the new `update` dependency: use `{ updateSupplier: vi.fn() }`.)

- [ ] **Step 2: Run** `npx vitest run test/persistence test/business/supplierUpdateService.test.ts test/business/supplierCreationService.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**

`supplierWriteRepository.ts` (+ header pair) — delete the `reactivateSupplier` declaration and add to `SupplierChange`:

```ts
  /**
   * Reactivation (Arch §6.2): the row must be soft-deleted; the same UPDATE sets is_deleted false
   * and is_active true, so the flags commit only if the whole edit transaction succeeds.
   */
  reactivate?: boolean;
```

`mysqlSupplierWriteRepository.ts` (+ header pair) — delete the whole `reactivateSupplier` method; in `updateSupplier`, replace the `is_active` line and the `WHERE` clause so the block reads:

```ts
          if (change.isActive !== undefined && change.reactivate !== true) set('is_active', change.isActive ? 1 : 0);
          if (change.reactivate === true) sets.push('is_deleted = FALSE', 'is_active = TRUE');
          set('updated_on', change.now);
          sets.push('version = version + 1');

          const [updated] = await conn.query<ResultSetHeader>(
            `UPDATE supplier SET ${sets.join(', ')}
             WHERE supplier_id = ? AND version = ? AND is_deleted = ${change.reactivate === true ? 'TRUE' : 'FALSE'}`,
            [...params, supplierId, change.version],
          );
```
(The interpolated value is one of two fixed literals; no user input reaches the SQL text. `insertChildren` is still used by `insertSupplier`.)

`supplierUpdateService.ts` (+ header pair) — change the signature and the first checks:

```ts
    async updateSupplier(
      supplierId: number,
      input: UpdateSupplierInput,
      files: PhotoFile[],
      options: { reactivate?: boolean } = {},
    ): Promise<UpdateResult> {
      const current = await repo.findCurrent(supplierId);
      if (current === null) throw new AppError(404, 'Not Found', 'Supplier not found.');
      if (options.reactivate === true) {
        // Reactivation edits a soft-deleted row; a live row means someone else got there first.
        if (!current.isDeleted) throw invalid('name', 'A supplier with the same name, type and location already exists.');
      } else if (current.isDeleted) {
        throw new AppError(404, 'Not Found', 'Supplier not found.');
      }
      if (input.version !== current.version) {
```
(keep the existing `409` line and everything after it), and where `change` is created add:

```ts
      const change: SupplierChange = { version: input.version, now: sgtDatetime(clock()) };
      if (options.reactivate === true) change.reactivate = true;
```

`supplierCreationService.ts` (+ header pair) — add the import and dependency:

```ts
import type { UpdateSupplierInput } from '../validation/supplierUpdateInput.js';
```
```ts
interface Dependencies {
  repo: SupplierWriteRepository;
  storage: PhotoStorage;
  reader: { getAdminSupplier(supplierId: number): Promise<unknown> };
  /** The Phase 3 edit cycle; in reactivation mode it also restores the flags in its transaction. */
  update: {
    updateSupplier(
      supplierId: number,
      input: UpdateSupplierInput,
      files: PhotoFile[],
      options?: { reactivate?: boolean },
    ): Promise<{ statusCode: 200; body: unknown }>;
  };
  clock?: () => Date;
}
```
Destructure `update`, add this helper inside the factory:

```ts
  async function reactivate(supplierId: number, input: CreateSupplierInput, photos: PhotoFile[]): Promise<CreationResult> {
    const current = await repo.findCurrent(supplierId);
    if (current === null) throw new AppError(500, 'Internal Server Error', 'Supplier could not be saved.');

    // The submitted details and photos go through the ordinary edit cycle, attempted before anything
    // is committed; the flag restore rides in the edit's own transaction (team decision 2026-09-30).
    // New photos replace the existing ones entirely: one placeholder per file, none retained, so the
    // edit cycle writes cleanup outbox rows for every old photo. No photos submitted leaves them untouched.
    const placeholders = photos.map((_, index) => `photo-${index}`);
    const edit: UpdateSupplierInput = {
      version: current.version,
      name: input.name,
      type: input.type,
      desc: input.desc,
      locationId: input.locationId,
      categoryIds: input.categoryIds,
      openingHours: JSON.stringify(input.hours.map(({ day, open, close }) => ({ day, open, close }))),
      is24h: input.hours.some((hour) => hour.is24h),
      isPhotoDirty: photos.length > 0,
      ...(photos.length > 0 ? { photoIds: placeholders, placeholderIds: placeholders } : {}),
    };
    const result = await update.updateSupplier(supplierId, edit, photos, { reactivate: true });
    return { statusCode: 200, body: result.body };
  }
```
In `createSupplier`, right after the duplicate check (`if (existing !== null && !existing.isDeleted) throw ...`) add `if (existing !== null) return reactivate(existing.supplierId, input, photos);`, then simplify the rest to the insert-only path (`supplierId = await repo.insertSupplier(record)`, `statusCode: 201`, drop the `existing === null` ternaries). `CreationResult.statusCode` stays `200 | 201`.

`app.ts` — construct `supplierUpdate` **before** `supplierCreation` and pass `update: supplierUpdate` to `createSupplierCreationService`.

- [ ] **Step 4: Run** `npx vitest run` (whole suite) and `npx tsc --noEmit -p tsconfig.json` — Expected: PASS; fix any fake that still implements the removed `reactivateSupplier` or the old `updateSupplier` arity.
- [ ] **Step 5: Commit** — `git add src test && git commit -m "feat(supplier-service): reactivate a soft-deleted supplier through the edit cycle in one transaction"`

---

### Task 9: Dead-letter repository

**Files:** Create `src/persistence/deadLetterRepository.ts`, `src/persistence/mysqlDeadLetterRepository.ts`; Test `test/persistence/mysqlDeadLetterRepository.test.ts`

- [ ] **Step 1: Write the failing test** — `test/persistence/mysqlDeadLetterRepository.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the dead_letter_jobs repository (Phase 4 plan Task 9). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import { describe, expect, it, vi } from 'vitest';
import { createMysqlDeadLetterRepository } from '../../src/persistence/mysqlDeadLetterRepository.js';

describe('mysql dead-letter repository', () => {
  it('inserts the job columns and leaves status to its UNRESOLVED default', async () => {
    const query = vi.fn().mockResolvedValue([{}, []]);
    const repo = createMysqlDeadLetterRepository({ query } as unknown as Pool);

    await repo.insert({
      jobId: 'j-1',
      taskName: 'supplier_suspension',
      payload: { supplier_id: 101 },
      errorTrace: 'Error: boom',
      failedAt: '2026-09-30 10:00:00',
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql.replace(/\s+/g, ' ').trim()).toBe(
      'INSERT INTO dead_letter_jobs (job_id, task_name, payload, error_trace, failed_at) VALUES (?, ?, CAST(? AS JSON), ?, ?)',
    );
    expect(params).toEqual(['j-1', 'supplier_suspension', '{"supplier_id":101}', 'Error: boom', '2026-09-30 10:00:00']);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/persistence/mysqlDeadLetterRepository.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** `src/persistence/deadLetterRepository.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: DeadLetterRepository port over the decided dead_letter_jobs table (Phase 4 plan Task 9;
 *        SupplierServiceArchitecture.md §6.4, §8.1). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
export interface DeadLetterEntry {
  jobId: string;
  taskName: string;
  payload: unknown;
  /** The last attempt's error. */
  errorTrace: string;
  /** Singapore wall-clock 'YYYY-MM-DD HH:MM:SS' (Arch §9 item 11). */
  failedAt: string;
}

export interface DeadLetterRepository {
  /** Inserts one row; `status` takes the table default UNRESOLVED. */
  insert(entry: DeadLetterEntry): Promise<void>;
}
```

`src/persistence/mysqlDeadLetterRepository.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: MySQL implementation of DeadLetterRepository (Phase 4 plan Task 9). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { Pool } from 'mysql2/promise';
import type { DeadLetterRepository } from './deadLetterRepository.js';

export function createMysqlDeadLetterRepository(pool: Pool): DeadLetterRepository {
  return {
    async insert(entry) {
      await pool.query(
        `INSERT INTO dead_letter_jobs (job_id, task_name, payload, error_trace, failed_at)
         VALUES (?, ?, CAST(? AS JSON), ?, ?)`,
        [entry.jobId, entry.taskName, JSON.stringify(entry.payload), entry.errorTrace, entry.failedAt],
      );
    },
  };
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** — `git add src/persistence/deadLetterRepository.ts src/persistence/mysqlDeadLetterRepository.ts test/persistence/mysqlDeadLetterRepository.test.ts && git commit -m "feat(supplier-service): add dead-letter repository"`

---

### Task 10: Downstream ports, mocks and job handlers

**Files:** Create `src/worker/downstream.ts`, `src/worker/handlers.ts`; Test `test/worker/downstream.test.ts`, `test/worker/handlers.test.ts`

- [ ] **Step 1: Write the failing tests.** `test/worker/downstream.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the logging mock Order/Message clients (Phase 4 plan Task 10). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createMockMessageClient, createMockOrderClient } from '../../src/worker/downstream.js';

describe('mock downstream clients', () => {
  it('log the call and succeed by default', async () => {
    const log = vi.fn();
    await createMockOrderClient({ log }).deleteUncollectedRequests(101);
    await createMockMessageClient({ log }).notifyAffected(101);
    expect(log).toHaveBeenCalledTimes(2);
    expect(String(log.mock.calls[0]?.[0])).toContain('101');
  });

  it('reject when forced to fail, so retries can be exercised', async () => {
    const log = vi.fn();
    await expect(createMockOrderClient({ fail: true, log }).deleteUncollectedRequests(101)).rejects.toThrow();
    await expect(createMockMessageClient({ fail: true, log }).notifyAffected(101)).rejects.toThrow();
  });
});
```

`test/worker/handlers.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the image_cleanup and supplier_suspension handlers (Phase 4 plan Task 10). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createPhotoCleanupHandler, createSuspensionHandler } from '../../src/worker/handlers.js';

describe('photo cleanup handler', () => {
  it('deletes the cloud object at photo_location', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    await createPhotoCleanupHandler({ delete: del })({ photo_id: 7, photo_location: 'loc-7' });
    expect(del).toHaveBeenCalledWith('loc-7');
  });

  it('treats an invalid payload as a bad job (unrecoverable) and deletes nothing', async () => {
    const del = vi.fn();
    const error = await createPhotoCleanupHandler({ delete: del })({ photo_id: 7 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(del).not.toHaveBeenCalled();
  });

  it('lets a storage failure propagate as an ordinary, retryable error', async () => {
    const del = vi.fn().mockRejectedValue(new Error('s3 down'));
    const error = await createPhotoCleanupHandler({ delete: del })({ photo_id: 7, photo_location: 'x' }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ message: 's3 down' });
    expect(error).not.toBeInstanceOf(UnrecoverableError);
  });
});

describe('suspension handler', () => {
  it('cancels uncollected orders, then notifies, for the supplier', async () => {
    const calls: string[] = [];
    const order = { deleteUncollectedRequests: vi.fn(async () => void calls.push('order')) };
    const message = { notifyAffected: vi.fn(async () => void calls.push('message')) };
    await createSuspensionHandler({ order, message })({ supplier_id: 101 });
    expect(order.deleteUncollectedRequests).toHaveBeenCalledWith(101);
    expect(message.notifyAffected).toHaveBeenCalledWith(101);
    expect(calls).toEqual(['order', 'message']);
  });

  it('does not notify when the order call fails', async () => {
    const order = { deleteUncollectedRequests: vi.fn().mockRejectedValue(new Error('order down')) };
    const message = { notifyAffected: vi.fn() };
    await expect(createSuspensionHandler({ order, message })({ supplier_id: 101 })).rejects.toThrow('order down');
    expect(message.notifyAffected).not.toHaveBeenCalled();
  });

  it('treats a payload without a numeric supplier_id as a bad job', async () => {
    const order = { deleteUncollectedRequests: vi.fn() };
    const message = { notifyAffected: vi.fn() };
    const error = await createSuspensionHandler({ order, message })({ supplier_id: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(order.deleteUncollectedRequests).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/worker/downstream.test.ts test/worker/handlers.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement.** `src/worker/downstream.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Order Service / Message Service ports and logging mock adapters (Phase 4 plan Task 10).
 *        The concrete request contracts are deferred (SupplierServiceArchitecture.md §9 items 5, 17);
 *        the method names and the logging-mock approach are the team's answer of 2026-09-30. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
/** Order Service delete entrypoint (F8.4.2): cancels requests for the supplier not yet collected. */
export interface OrderClient {
  deleteUncollectedRequests(supplierId: number): Promise<void>;
}

/** Message Service notify entrypoint (F8.4.3): notifies affected requesters/couriers. */
export interface MessageClient {
  notifyAffected(supplierId: number): Promise<void>;
}

interface MockOptions {
  /** Force every call to fail, so retries and dead-lettering can be exercised. */
  fail?: boolean;
  log?: (message: string) => void;
}

export function createMockOrderClient({ fail = false, log = console.log }: MockOptions = {}): OrderClient {
  return {
    async deleteUncollectedRequests(supplierId) {
      log(`[mock order-service] delete uncollected requests for supplier ${supplierId}`);
      if (fail) throw new Error('mock order-service failure');
    },
  };
}

export function createMockMessageClient({ fail = false, log = console.log }: MockOptions = {}): MessageClient {
  return {
    async notifyAffected(supplierId) {
      log(`[mock message-service] notify users affected by supplier ${supplierId}`);
      if (fail) throw new Error('mock message-service failure');
    },
  };
}
```

`src/worker/handlers.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Handlers for the image_cleanup and supplier_suspension job types (Phase 4 plan Task 10);
 *        SupplierServiceArchitecture.md §8.1, §8.2. Payload shapes are the recorded/team-supplied ones;
 *        an invalid payload is a bad job (team answer 2026-09-30). No requirements, architecture,
 *        schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { z } from 'zod';
import type { PhotoStorage } from '../storage/photoStorage.js';
import type { MessageClient, OrderClient } from './downstream.js';

/** Resolves on success; a rejection is a failed attempt, an UnrecoverableError a bad job (no retries). */
export type JobHandler = (payload: unknown) => Promise<void>;

const photoCleanupPayload = z.object({ photo_id: z.number().int(), photo_location: z.string().min(1) });
const suspensionPayload = z.object({ supplier_id: z.number().int().positive() });

function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`);
    throw new UnrecoverableError(`Invalid job payload: ${issues.join('; ')}`);
  }
  return result.data;
}

export function createPhotoCleanupHandler(storage: Pick<PhotoStorage, 'delete'>): JobHandler {
  return async (payload) => {
    const { photo_location } = parsePayload(photoCleanupPayload, payload);
    await storage.delete(photo_location);
  };
}

export function createSuspensionHandler({ order, message }: { order: OrderClient; message: MessageClient }): JobHandler {
  return async (payload) => {
    const { supplier_id } = parsePayload(suspensionPayload, payload);
    // Order cancellation first, then the notification (Arch §8.1); the job is retried as a unit.
    await order.deleteUncollectedRequests(supplier_id);
    await message.notifyAffected(supplier_id);
  };
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS (8 tests).
- [ ] **Step 5: Commit** — `git add src/worker/downstream.ts src/worker/handlers.ts test/worker && git commit -m "feat(supplier-service): add worker handlers and mock downstream clients"`

---

### Task 11: Job processor (route, dead-letter, rethrow — BullMQ owns the retry timing)

**Files:** Create `src/worker/jobProcessor.ts`; Test `test/worker/jobProcessor.test.ts`

- [ ] **Step 1: Write the failing test** — `test/worker/jobProcessor.test.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the job processor: routing, dead-lettering, rethrow so BullMQ schedules the retry
 *        (Phase 4 plan Task 11). No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { createJobProcessor } from '../../src/worker/jobProcessor.js';

function build(handler: (payload: unknown) => Promise<void>) {
  const insert = vi.fn().mockResolvedValue(undefined);
  const log = vi.fn();
  const process = createJobProcessor({
    handlers: { work: handler },
    deadLetters: { insert },
    log,
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { process, insert, log };
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
    const { process, insert } = build(handler);
    await process(job());
    expect(handler).toHaveBeenCalledWith({ a: 1 });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, 3])('rethrows without dead-lettering on attempt %i so BullMQ schedules the retry', async (made) => {
    const { process, insert } = build(vi.fn().mockRejectedValue(new Error('downstream down')));
    await expect(process(job({ attemptsMade: made }))).rejects.toThrow('downstream down');
    expect(insert).not.toHaveBeenCalled();
  });

  it('writes one dead-letter row on the 5th failed attempt, then rethrows', async () => {
    const { process, insert } = build(vi.fn().mockRejectedValue(new Error('downstream down')));
    await expect(process(job({ attemptsMade: 4 }))).rejects.toThrow('downstream down');
    expect(insert).toHaveBeenCalledTimes(1);
    const entry = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(entry).toMatchObject({ jobId: 'j-1', taskName: 'work', payload: { a: 1 }, failedAt: '2026-09-30 10:00:00' });
    expect(String(entry.errorTrace)).toContain('downstream down');
  });

  it('dead-letters a bad job (UnrecoverableError) immediately, on the first attempt', async () => {
    const { process, insert } = build(vi.fn().mockRejectedValue(new UnrecoverableError('bad payload')));
    await expect(process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('dead-letters an unknown job name immediately and fails it unrecoverably', async () => {
    const { process, insert } = build(vi.fn());
    await expect(process(job({ name: 'nope' }))).rejects.toBeInstanceOf(UnrecoverableError);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(String((insert.mock.calls[0]?.[0] as { errorTrace: string }).errorTrace)).toContain('nope');
  });

  it('logs a failed dead-letter insert and still rethrows the original error', async () => {
    const { process, insert, log } = build(vi.fn().mockRejectedValue(new UnrecoverableError('bad payload')));
    insert.mockRejectedValueOnce(new Error('db down'));
    await expect(process(job())).rejects.toBeInstanceOf(UnrecoverableError);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('records a non-Error rejection', async () => {
    const { process, insert } = build(vi.fn().mockRejectedValue('plain string'));
    await expect(process(job({ attemptsMade: 4 }))).rejects.toBe('plain string');
    expect(String((insert.mock.calls[0]?.[0] as { errorTrace: string }).errorTrace)).toContain('plain string');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/worker/jobProcessor.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/worker/jobProcessor.ts`

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: BullMQ job processor: route by job name, insert a dead_letter_jobs row when a job fails for
 *        the last time or is a bad job, and rethrow so BullMQ schedules the retry (Phase 4 plan Task 11;
 *        SupplierServiceArchitecture.md §8.1, §8.2). No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { UnrecoverableError } from 'bullmq';
import type { DeadLetterRepository } from '../persistence/deadLetterRepository.js';
import { sgtDatetime } from '../utils/time.js';
import type { JobHandler } from './handlers.js';

/** The parts of a BullMQ Job the processor reads. */
export interface ProcessableJob {
  id?: string | undefined;
  name: string;
  data: unknown;
  /** Attempts that have already failed; 0 while the first attempt runs. */
  attemptsMade: number;
  opts: { attempts?: number | undefined };
}

interface Dependencies {
  handlers: Record<string, JobHandler>;
  deadLetters: DeadLetterRepository;
  log?: (message: string) => void;
  clock?: () => Date;
}

function errorTrace(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

export function createJobProcessor({ handlers, deadLetters, log = console.error, clock = () => new Date() }: Dependencies) {
  async function deadLetter(job: ProcessableJob, error: unknown): Promise<void> {
    try {
      await deadLetters.insert({
        jobId: job.id ?? 'unknown',
        taskName: job.name,
        payload: job.data,
        errorTrace: errorTrace(error),
        failedAt: sgtDatetime(clock()),
      });
    } catch (insertError) {
      // The job stays in BullMQ's failed set for manual recovery; the original error is still rethrown.
      log(`Could not write dead_letter_jobs row for job ${job.id ?? 'unknown'}: ${errorTrace(insertError)}`);
    }
  }

  return async function process(job: ProcessableJob): Promise<void> {
    const handler = handlers[job.name];
    if (handler === undefined) {
      const error = new UnrecoverableError(`No handler registered for task_name "${job.name}".`);
      await deadLetter(job, error);
      throw error;
    }

    try {
      await handler(job.data);
    } catch (error) {
      // Final when a bad job (UnrecoverableError) or when this was the last allowed attempt (BullMQ: attemptsMade + 1 >= attempts).
      const isFinal = error instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinal) await deadLetter(job, error);
      throw error; // BullMQ schedules the delayed retry (or marks the job failed); the worker stays free.
    }
  };
}

export type JobProcessor = ReturnType<typeof createJobProcessor>;
```

- [ ] **Step 4: Run** the same command — Expected: PASS (10 tests).
- [ ] **Step 5: Commit** — `git add src/worker/jobProcessor.ts test/worker/jobProcessor.test.ts && git commit -m "feat(supplier-service): add worker job processor with dead-lettering"`

---

### Task 12: Outbox relay (one tick) and its every-second scheduler

**Files:** Create `src/worker/outboxRelay.ts`, `src/worker/startRelay.ts`; Test `test/worker/outboxRelay.test.ts`, `test/worker/startRelay.test.ts`

- [ ] **Step 1: Write the failing tests.** `test/worker/outboxRelay.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for one outbox relay tick: read, enqueue, delete (Phase 4 plan Task 12). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { describe, expect, it, vi } from 'vitest';
import { createOutboxRelay } from '../../src/worker/outboxRelay.js';

const suspension = (id: number, version: number) => ({
  id,
  taskName: 'supplier_suspension',
  payload: { supplier_id: 101 },
  version,
});

function build(rows: Array<ReturnType<typeof suspension>>) {
  const outbox = {
    fetchBatch: vi.fn().mockResolvedValue(rows),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const deadLetters = { insert: vi.fn().mockResolvedValue(undefined) };
  const log = vi.fn();
  const relayOnce = createOutboxRelay({
    outbox,
    queue,
    deadLetters,
    log,
    clock: () => new Date('2026-09-30T02:00:00Z'),
  });
  return { relayOnce, outbox, queue, deadLetters, log };
}

describe('outbox relay tick', () => {
  it('does nothing when the outbox is empty', async () => {
    const { relayOnce, queue, outbox } = build([]);
    expect(await relayOnce()).toBe(0);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(outbox.delete).not.toHaveBeenCalled();
  });

  it('reads a batch of 100', async () => {
    const { relayOnce, outbox } = build([]);
    await relayOnce();
    expect(outbox.fetchBatch).toHaveBeenCalledWith(100);
  });

  it('enqueues each row in the order read, as job outbox-<id>, and deletes each only after its enqueue', async () => {
    const { relayOnce, queue, outbox } = build([suspension(4, 6), suspension(5, 7)]);

    expect(await relayOnce()).toBe(2);

    expect(queue.enqueue.mock.calls).toEqual([
      ['queue:supplier:suspension', { id: 'outbox-4', task_name: 'supplier_suspension', payload: { supplier_id: 101 } }],
      ['queue:supplier:suspension', { id: 'outbox-5', task_name: 'supplier_suspension', payload: { supplier_id: 101 } }],
    ]);
    expect(outbox.delete.mock.calls).toEqual([[4], [5]]);
    const order = [
      queue.enqueue.mock.invocationCallOrder[0] ?? 0,
      outbox.delete.mock.invocationCallOrder[0] ?? 0,
      queue.enqueue.mock.invocationCallOrder[1] ?? 0,
      outbox.delete.mock.invocationCallOrder[1] ?? 0,
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('routes an image_cleanup row to the cleanup queue', async () => {
    const { relayOnce, queue } = build([
      { id: 9, taskName: 'image_cleanup', payload: { photo_id: 7, photo_location: 'loc' }, version: 3 },
    ] as never);
    await relayOnce();
    expect(queue.enqueue.mock.calls[0]?.[0]).toBe('queue:image:cleanup');
  });

  it('stops the tick at the first enqueue failure, keeps the row, and tries again next tick', async () => {
    const { relayOnce, queue, outbox, log } = build([suspension(4, 6), suspension(5, 7)]);
    queue.enqueue.mockRejectedValueOnce(new Error('redis down'));

    expect(await relayOnce()).toBe(0);

    expect(queue.enqueue).toHaveBeenCalledTimes(1); // row 5 is not attempted: order is preserved
    expect(outbox.delete).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('dead-letters and removes a row whose task has no queue, then carries on with the next row', async () => {
    const { relayOnce, queue, outbox, deadLetters } = build([
      { id: 3, taskName: 'nope', payload: { a: 1 }, version: 5 },
      suspension(4, 6),
    ] as never);

    expect(await relayOnce()).toBe(1);

    expect(deadLetters.insert).toHaveBeenCalledTimes(1);
    expect(deadLetters.insert.mock.calls[0]?.[0]).toMatchObject({
      jobId: 'outbox-3',
      taskName: 'nope',
      payload: { a: 1 },
      failedAt: '2026-09-30 10:00:00',
    });
    expect(outbox.delete.mock.calls).toEqual([[3], [4]]);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('lets a failed delete propagate so the tick fails and the row is retried (the job id makes the re-enqueue harmless)', async () => {
    const { relayOnce, outbox } = build([suspension(4, 6)]);
    outbox.delete.mockRejectedValueOnce(new Error('db down'));
    await expect(relayOnce()).rejects.toThrow('db down');
  });
});
```

`test/worker/startRelay.test.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Tests for the every-second relay scheduler wiring, with BullMQ mocked (Phase 4 plan
 *        Task 12). No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertJobScheduler: vi.fn(),
  queueClose: vi.fn(),
  workerClose: vi.fn(),
  workers: [] as Array<{ name: string; processor: () => Promise<void>; opts: Record<string, unknown> }>,
  queues: [] as Array<{ name: string; opts: Record<string, unknown> }>,
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(name: string, opts: Record<string, unknown>) {
      mocks.queues.push({ name, opts });
    }
    upsertJobScheduler = mocks.upsertJobScheduler;
    close = mocks.queueClose;
  },
  Worker: class {
    constructor(name: string, processor: () => Promise<void>, opts: Record<string, unknown>) {
      mocks.workers.push({ name, processor, opts });
    }
    on = vi.fn();
    close = mocks.workerClose;
  },
}));

import { OUTBOX_RELAY_INTERVAL_MS, startRelay } from '../../src/worker/startRelay.js';

describe('startRelay', () => {
  beforeEach(() => {
    mocks.workers.length = 0;
    mocks.queues.length = 0;
    vi.clearAllMocks();
  });

  it('schedules one tick per second on queue:outbox:relay and runs the relay from a single-concurrency worker', async () => {
    const relayOnce = vi.fn().mockResolvedValue(0);

    await startRelay({ host: 'h', port: 1 }, relayOnce);

    expect(OUTBOX_RELAY_INTERVAL_MS).toBe(1000);
    expect(mocks.queues[0]).toMatchObject({ name: 'relay', opts: { prefix: 'queue:outbox' } });
    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'outbox-relay',
      { every: 1000 },
      expect.objectContaining({ name: 'outbox_relay', opts: expect.objectContaining({ attempts: 1 }) }),
    );
    expect(mocks.workers[0]).toMatchObject({ name: 'relay', opts: { prefix: 'queue:outbox', concurrency: 1 } });

    await mocks.workers[0]?.processor();
    expect(relayOnce).toHaveBeenCalledTimes(1);
  });

  it('closes the worker and the queue', async () => {
    const relay = await startRelay({ host: 'h', port: 1 }, vi.fn());
    await relay.close();
    expect(mocks.workerClose).toHaveBeenCalled();
    expect(mocks.queueClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run test/worker/outboxRelay.test.ts test/worker/startRelay.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 3: Implement.** `src/worker/outboxRelay.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: One tick of the transactional-outbox relay (Phase 4 plan Task 12): read the outbox, enqueue
 *        each package into BullMQ, delete the row once it is enqueued (team answer, 2026-09-30).
 *        Batch size, job-id scheme and unroutable-row handling are the plan's readings 3-5. No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import type { DeadLetterRepository } from '../persistence/deadLetterRepository.js';
import type { OutboxRepository } from '../persistence/outboxRepository.js';
import type { JobQueue } from '../queue/jobQueue.js';
import { queueKeyForTask } from '../queue/tasks.js';
import { sgtDatetime } from '../utils/time.js';

const BATCH_SIZE = 100;

interface Dependencies {
  outbox: OutboxRepository;
  queue: JobQueue;
  deadLetters: DeadLetterRepository;
  log?: (message: string) => void;
  clock?: () => Date;
}

/** Returns a function that runs one relay tick and resolves to the number of rows enqueued. */
export function createOutboxRelay({ outbox, queue, deadLetters, log = console.error, clock = () => new Date() }: Dependencies) {
  return async function relayOnce(): Promise<number> {
    const rows = await outbox.fetchBatch(BATCH_SIZE); // lowest supplier version first, then id
    let relayed = 0;

    for (const row of rows) {
      const jobId = `outbox-${row.id}`; // outbox ids are never reused, so a re-enqueue after a crash is ignored by BullMQ
      const queueKey = queueKeyForTask(row.taskName);

      if (queueKey === undefined) {
        // A bad job goes straight to the dead letter; leaving it would block every later row.
        await deadLetters.insert({
          jobId,
          taskName: row.taskName,
          payload: row.payload,
          errorTrace: `No queue is registered for task_name "${row.taskName}".`,
          failedAt: sgtDatetime(clock()),
        });
        await outbox.delete(row.id);
        continue;
      }

      try {
        await queue.enqueue(queueKey, { id: jobId, task_name: row.taskName, payload: row.payload });
      } catch (error) {
        // Redis is unreachable or refused the job: keep the row and stop, so order is preserved and the next tick retries.
        log(`Outbox relay could not enqueue ${jobId}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      await outbox.delete(row.id); // only after a successful enqueue
      relayed += 1;
    }

    return relayed;
  };
}

export type OutboxRelay = ReturnType<typeof createOutboxRelay>;
```

`src/worker/startRelay.ts`:

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Runs the outbox relay every second with a BullMQ job scheduler (Phase 4 plan Task 12);
 *        interval and scheduler choice are the team's answer of 2026-09-30, the queue name
 *        queue:outbox:relay is the plan's reading 6. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review:
 */
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { splitQueueKey } from '../queue/bullQueue.js';

export const OUTBOX_RELAY_QUEUE_KEY = 'queue:outbox:relay';
export const OUTBOX_RELAY_INTERVAL_MS = 1_000;
const SCHEDULER_ID = 'outbox-relay';

export async function startRelay(
  connection: ConnectionOptions,
  relayOnce: () => Promise<number>,
  log: (message: string) => void = console.error,
): Promise<{ close(): Promise<void> }> {
  const { prefix, name } = splitQueueKey(OUTBOX_RELAY_QUEUE_KEY);

  const queue = new Queue(name, { connection, prefix });
  // The scheduler only creates the next tick when the previous one starts, so ticks never pile up.
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: OUTBOX_RELAY_INTERVAL_MS },
    { name: 'outbox_relay', opts: { attempts: 1, removeOnComplete: true, removeOnFail: true } },
  );

  const worker = new Worker(
    name,
    async () => {
      await relayOnce();
    },
    { connection, prefix, concurrency: 1 },
  );
  worker.on('error', (error) => log(`[${OUTBOX_RELAY_QUEUE_KEY}] worker error: ${error.message}`));
  worker.on('failed', (_job, error) => log(`[${OUTBOX_RELAY_QUEUE_KEY}] relay tick failed: ${error.message}`));

  return {
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
```

- [ ] **Step 4: Run** the same command — Expected: PASS (9 tests). If `tsc` later objects to `upsertJobScheduler`'s argument shape for the installed BullMQ version, match that version's signature (`schedulerId, repeatOptions, jobTemplate`); the behaviour (every 1000 ms, name `outbox_relay`, `attempts: 1`) must not change.
- [ ] **Step 5: Commit** — `git add src/worker/outboxRelay.ts src/worker/startRelay.ts test/worker && git commit -m "feat(supplier-service): add the outbox relay and its every-second scheduler"`

---

### Task 13: Task workers, entrypoint, config and scripts

**Files:** Create `src/worker/startWorkers.ts`, `src/worker/main.ts`; Modify `src/config.ts`, `.env.example`, `package.json`. (Wiring that needs a live Redis is covered by Task 16; there is no unit test for `startWorkers`/`main`.)

- [ ] **Step 1: Implement config.** `src/config.ts`: add `MOCK_DOWNSTREAM_FAILURE: z.enum(["true", "false"]).optional(),` to `envSchema`; add `mockDownstreamFailure: values.MOCK_DOWNSTREAM_FAILURE === "true",` to the frozen config; append a header pair. `.env.example`: add `MOCK_DOWNSTREAM_FAILURE=false` and a header pair. `package.json`: add after `"dev"`:

```json
    "worker": "tsx src/worker/main.ts",
    "worker:dev": "nodemon -L --watch src --ext ts,json --exec tsx src/worker/main.ts",
```

- [ ] **Step 2: Implement `src/worker/startWorkers.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Starts one BullMQ Worker per task queue (Phase 4 plan Task 13). Queue keys, attempts and
 *        delays are the team-supplied values; BullMQ was chosen by the team (2026-09-30). No
 *        requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { Worker, type ConnectionOptions } from 'bullmq';
import { PHOTO_DELETION_QUEUE_KEY } from '../queue/photoDeletionJob.js';
import { SUSPENSION_QUEUE_KEY } from '../queue/tasks.js';
import { backoffStrategy, splitQueueKey } from '../queue/bullQueue.js';
import type { JobProcessor } from './jobProcessor.js';

export function startWorkers(
  connection: ConnectionOptions,
  processor: JobProcessor,
  log: (message: string) => void = console.error,
): Worker[] {
  return [PHOTO_DELETION_QUEUE_KEY, SUSPENSION_QUEUE_KEY].map((queueKey) => {
    const { prefix, name } = splitQueueKey(queueKey);
    const worker = new Worker(name, processor, {
      connection,
      prefix,
      concurrency: 1, // one job at a time per queue
      settings: { backoffStrategy }, // 5 s, 25 s, 125 s, 625 s via the job's { type: 'custom' } backoff
    });
    worker.on('error', (error) => log(`[${queueKey}] worker error: ${error.message}`));
    worker.on('failed', (job, error) =>
      log(`[${queueKey}] job ${job?.id ?? 'unknown'} attempt ${job?.attemptsMade ?? '?'} failed: ${error.message}`),
    );
    return worker;
  });
}
```

- [ ] **Step 3: Implement `src/worker/main.ts`**

```ts
/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Background worker process entrypoint (Phase 4 plan Task 13): wires the outbox relay, the
 *        BullMQ task workers, the two job handlers, the mock Order/Message clients and the
 *        dead-letter repository. A separate process from the API, with standard SIGINT/SIGTERM
 *        shutdown that lets the active job finish (team answers, 2026-09-30). No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { createMysqlDeadLetterRepository } from '../persistence/mysqlDeadLetterRepository.js';
import { createMysqlOutboxRepository } from '../persistence/mysqlOutboxRepository.js';
import { createBullJobQueue } from '../queue/bullQueue.js';
import { PHOTO_DELETION_TASK_NAME } from '../queue/photoDeletionJob.js';
import { SUSPENSION_TASK_NAME } from '../queue/tasks.js';
import { createConfiguredPhotoStorage } from '../storage/s3PhotoStorage.js';
import { createMockMessageClient, createMockOrderClient } from './downstream.js';
import { createPhotoCleanupHandler, createSuspensionHandler } from './handlers.js';
import { createJobProcessor } from './jobProcessor.js';
import { createOutboxRelay } from './outboxRelay.js';
import { startRelay } from './startRelay.js';
import { startWorkers } from './startWorkers.js';

const connection = { host: config.redis.host, port: config.redis.port };
const deadLetters = createMysqlDeadLetterRepository(pool);
const jobQueue = createBullJobQueue(connection);

const processor = createJobProcessor({
  handlers: {
    [PHOTO_DELETION_TASK_NAME]: createPhotoCleanupHandler(createConfiguredPhotoStorage(config.photoStore)),
    [SUSPENSION_TASK_NAME]: createSuspensionHandler({
      order: createMockOrderClient({ fail: config.mockDownstreamFailure }),
      message: createMockMessageClient({ fail: config.mockDownstreamFailure }),
    }),
  },
  deadLetters,
});

const relay = await startRelay(
  connection,
  createOutboxRelay({ outbox: createMysqlOutboxRepository(pool), queue: jobQueue, deadLetters }),
);
const workers = startWorkers(connection, processor);
console.log('supplier-service worker started');

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; taking no new jobs and waiting for the active job to finish.`);
  await relay.close(); // stop moving outbox rows first
  // Worker.close() stops fetching and waits for the job in progress (no built-in timeout).
  await Promise.all(workers.map((worker) => worker.close()));
  await jobQueue.close();
  await pool.end();
  console.log('supplier-service worker stopped');
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}
```

- [ ] **Step 4: Run** `npx tsc --noEmit -p tsconfig.json`, `npm run lint`, and `npx vitest run` — Expected: no type/lint errors, all tests pass. If `tsc` rejects `new Worker(name, processor, …)` because `JobProcessor` takes a `ProcessableJob` rather than BullMQ's `Job`, wrap it: `(job) => processor(job)` (a BullMQ `Job` satisfies `ProcessableJob`); behaviour unchanged. If `pool` is not a named export of `src/db/pool.ts`, match how `src/app.ts` imports it.

- [ ] **Step 5: Commit** — `git add src/worker src/config.ts .env.example package.json && git commit -m "feat(supplier-service): add the worker process with graceful shutdown"`

---

### Task 14: Dedicated worker container and the photo-store endpoint (development)

**Files:** Modify `../compose.yaml` (repo root; append to the file's disclosure header a dated `Scope`/`Author review` pair in that file's `#` style), `.env.example`

- [ ] **Step 1: Add the worker service** after `supplier-service` in `../compose.yaml`:

```yaml
  # Background worker for the supplier queues and the outbox relay (SupplierServiceArchitecture.md
  # §8.1, §8.2). Same image as supplier-service, different command. PORT and USER_SERVICE_URL are set
  # only because supplier-service/src/config.ts validates them at startup; the worker opens no port.
  supplier-worker:
    build:
      context: ./supplier-service
      target: dev
    container_name: foc-supplier-worker
    init: true
    restart: unless-stopped
    command: ["npm", "run", "worker:dev"]
    # Let an in-flight job finish on `docker stop` (Docker's default is SIGKILL after 10 s).
    stop_grace_period: 30s
    environment:
      NODE_ENV: development
      PORT: 3002
      DB_HOST: supplier-db
      DB_PORT: 3306
      DB_NAME: supplier_service
      DB_USER: root
      DB_PASSWORD: ${SUPPLIER_DB_PASSWORD}
      REDIS_HOST: supplier-redis
      REDIS_PORT: 6379
      USER_SERVICE_URL: http://user-service:3001
      PHOTO_STORE_ENDPOINT: ${PHOTO_STORE_ENDPOINT:-http://host.docker.internal:9000}
      PHOTO_STORE_BUCKET: ${PHOTO_STORE_BUCKET:-supplier-photos}
      PHOTO_STORE_ACCESS_KEY: ${PHOTO_STORE_ACCESS_KEY:-photostoredev}
      PHOTO_STORE_SECRET_KEY: ${PHOTO_STORE_SECRET_KEY:-photostoredev-secret}
      MOCK_DOWNSTREAM_FAILURE: ${MOCK_DOWNSTREAM_FAILURE:-false}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./supplier-service/src:/app/src
    depends_on:
      supplier-db:
        condition: service_healthy
      supplier-redis:
        condition: service_healthy
```

- [ ] **Step 2: Give the API container the same endpoint string.** Stored `photo_location` values start with the endpoint of the process that uploaded them, and the worker's `keyOf` only accepts its own endpoint's prefix, so the API must use the same string. In the existing `supplier-service` block of `../compose.yaml`, add to its `environment:` the same four `PHOTO_STORE_*` lines as above (same `${…:-…}` defaults), and add `extra_hosts: ["host.docker.internal:host-gateway"]`. In `.env.example` change the value to `PHOTO_STORE_ENDPOINT=http://host.docker.internal:9000` with a comment: `# Must be the same string in the API and the worker; stored photo locations start with it.` (Docker Desktop resolves `host.docker.internal` on the host too, so a host-run API can use it.)

- [ ] **Step 3: Check nothing else depends on the old value** — `grep -rn "localhost:9000" . --include=*.ts --include=*.md --include=*.yaml --include=.env.example --exclude-dir=node_modules`. Update documentation mentions to the new value; leave test fixtures that pass their own endpoint alone (report any that read `.env.example`).

- [ ] **Step 4: Validate** — from the repo root run `docker compose config --quiet`. Expected: no output. If it fails only because a `${…:?set … in .env}` variable is unset in this shell, that is the environment, not the change; set the variable and re-run. Then `docker compose build supplier-worker` — Expected: builds.

- [ ] **Step 5: Commit** — `git add ../compose.yaml .env.example && git commit -m "chore(compose): add supplier-worker container and align the photo-store endpoint"`

---

### Task 15: Idempotency review (against the current API configuration)

Confirms each thing that can run twice is safe to. No production code unless a check fails.

**Files:** Modify `test/worker/handlers.test.ts`, `test/storage/s3PhotoStorage.minio.test.ts`

| Repeatable thing | Why it can repeat | Confirmed by |
| --- | --- | --- |
| `DELETE` supplier | Client retry / double click | Tasks 4–5: the conditional `UPDATE … AND is_deleted = FALSE` holds the row lock until commit, so a concurrent second request waits, then matches nothing and gets `404` and writes no outbox row; exactly one suspension task is committed (Arch §7.5). A `500` now means the transaction did not commit, so nothing was deleted and a retry is a fresh attempt |
| `PUT` supplier | Client retry | Existing: stale `version` → `409`, no second edit, so no second batch of cleanup outbox rows (Phase 3) |
| `POST` supplier (create) | Client retry | Existing: `Idempotency-Key` replay |
| `POST` supplier (reactivation) | Client retry after a failure | Task 8: a failure before the commit leaves the supplier soft-deleted and unchanged (cleanup rows commit with the edit or not at all), so a same-key retry runs the reactivation again |
| Outbox relay | A crash between "enqueued" and "deleted from outbox", or overlapping ticks | Task 12: job id `outbox-<id>` is ignored by BullMQ while that job exists; after a completed job is removed, a re-add runs it again, so the handlers below must be safe to repeat |
| `image_cleanup` job | BullMQ delivers at least once (a stalled job can run again); relay re-add (above) | Handler test below, MinIO test below: deleting an already-deleted object succeeds |
| `supplier_suspension` job | Retried as a unit; may be redelivered; relay re-add (above) | Order mock and Message mock are safe to repeat. **Not confirmable until the real contracts exist:** a redelivery after both calls succeeded would call both again, so the real Order delete must be idempotent and the Message entrypoint should accept a de-dup key. The ports currently take only `supplierId`, per the team's answer; adding the job id is a contract decision |

- [ ] **Step 1: Write the tests.** In `test/worker/handlers.test.ts`, inside `describe('photo cleanup handler', …)` add:

```ts
  it('is safe to run twice for the same job (storage deletion is idempotent)', async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const handler = createPhotoCleanupHandler({ delete: del });
    await handler({ photo_id: 7, photo_location: 'loc-7' });
    await expect(handler({ photo_id: 7, photo_location: 'loc-7' })).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledTimes(2);
  });
```
and in `describe('suspension handler', …)`:

```ts
  it('can be re-run as a unit after a partial failure: the order call repeats, the notification then goes out', async () => {
    const order = { deleteUncollectedRequests: vi.fn().mockResolvedValue(undefined) };
    const message = { notifyAffected: vi.fn().mockRejectedValueOnce(new Error('msg down')).mockResolvedValue(undefined) };
    const handler = createSuspensionHandler({ order, message });
    await expect(handler({ supplier_id: 101 })).rejects.toThrow('msg down');
    await expect(handler({ supplier_id: 101 })).resolves.toBeUndefined();
    expect(order.deleteUncollectedRequests).toHaveBeenCalledTimes(2);
    expect(message.notifyAffected).toHaveBeenCalledTimes(2);
  });
```
In `test/storage/s3PhotoStorage.minio.test.ts` (read the file's existing setup first and reuse its storage/bucket fixtures) add one test: upload a photo, `delete` its location twice, expect neither call to throw.

- [ ] **Step 2: Run** `npx vitest run test/worker/handlers.test.ts` — Expected: PASS. With the MinIO store running: `npm run test:minio` — Expected: PASS. If MinIO is not running, say so in the log rather than reporting it verified.

- [ ] **Step 3: Commit** — `git add test && git commit -m "test(supplier-service): confirm the worker handlers are safe to repeat"`

---

### Task 16: Verification against real services (manual)

**Files:** none changed (record results in the log entry). Needs MySQL, Redis, the API, the worker, a valid admin token; MinIO for the photo steps. Run from the repo root for `docker` commands.

- [ ] **Step 1: Static checks** — from `supplier-service/`: `npm test`, `npx tsc --noEmit -p tsconfig.json`, `npm run lint`. Expected: all pass. Report exact counts.

- [ ] **Step 2: Start everything** — `docker compose up -d supplier-db supplier-redis supplier-service supplier-worker`; apply the new table to the existing database: `npm run migrate` from `supplier-service/` (safe to re-run; or `docker exec foc-supplier-service npm run migrate`). Confirm `docker exec foc-supplier-db mysql -uroot -p -e "SHOW CREATE TABLE supplier_service.outbox"` shows the four columns. `docker logs -f foc-supplier-worker` shows "supplier-service worker started". Clear any old Phase 3 dev list: `docker exec foc-supplier-redis redis-cli DEL queue:image:cleanup`. Confirm new uploads produce locations starting `http://host.docker.internal:9000/supplier-photos/`.

- [ ] **Step 3: Delete path** — `DELETE /api/v1/admin/suppliers/<id>` with an admin token. Expected: `200 {"id":<id>,"isDeleted":true}`; within about a second the worker logs the two `[mock …]` lines; the outbox is empty again (`SELECT * FROM outbox;` → no rows); admin detail shows `isDeleted: true` and a higher `version`/`updatedOn`; a `user`-role `GET /api/v1/suppliers/<id>` → `404`; a second `DELETE` → `404` and adds no outbox row; `user`-role `DELETE` → `403`.

- [ ] **Step 4: Redis outage no longer affects DELETE** — `docker stop foc-supplier-redis`, then `DELETE` a supplier. Expected: `200` (the API does not touch Redis for jobs); `SELECT id, task_name, payload, version FROM outbox;` shows one `supplier_suspension` row whose `version` equals the supplier's new `version`. `docker start foc-supplier-redis`. Expected: within a few seconds the row disappears and the worker logs the two mock lines. While Redis was down the worker log shows relay/worker errors (record them).

- [ ] **Step 5: Worker down** — `docker stop foc-supplier-worker`, then `PUT` a supplier removing two photos and `DELETE` a second supplier. Expected: `200`s; the outbox holds the rows in the expected order (`SELECT * FROM outbox ORDER BY version, id;`; the two cleanup rows share a version). `docker start foc-supplier-worker`: expected the rows drain in that order and the jobs run (MinIO objects gone, mock lines logged).

- [ ] **Step 6: Delayed retry frees the worker** — set `MOCK_DOWNSTREAM_FAILURE=true`, `docker compose up -d supplier-worker`, delete another supplier. Expected in the worker log: attempt 1 fails at once; `docker exec foc-supplier-redis redis-cli ZRANGE queue:supplier:suspension:delayed 0 -1 WITHSCORES` shows the job with a future timestamp (about now + 5 s, then +25 s, +125 s, +625 s after each failure). While it is waiting, `PUT` a supplier removing a photo and confirm that `image_cleanup` job runs **immediately** (worker not blocked). After the fifth failure exactly one row exists: `SELECT job_id, task_name, payload, status FROM dead_letter_jobs;` → `outbox-<id>`, `supplier_suspension`, `{"supplier_id": <id>}`, `UNRESOLVED`. Do not shorten the delays in code; let it run (~13 min) or check the first retries now and the final row later.

- [ ] **Step 7: Bad rows** — insert directly: `INSERT INTO outbox (task_name, payload, version) VALUES ('nope', '{}', 1), ('supplier_suspension', '{}', 1);`. Expected: the unknown task is dead-lettered by the relay and removed from the outbox; the second is enqueued, fails validation, and is dead-lettered once with no retry.

- [ ] **Step 8: Reactivation** — soft-delete a supplier, then `POST` the same name/type/location with two new photos and a new description. Expected: `200`; `isDeleted` false, `isActive` true; details and photos are the submitted ones; `version` is one higher than before the POST; the old photos' objects are removed from MinIO by `image_cleanup` jobs (via the outbox). Repeat with **no** photos: existing photos untouched. **Failure case:** soft-delete another supplier, stop MinIO, `POST` the same identity with a photo, expect `500`, the admin detail still shows `isDeleted: true` with unchanged details, and the outbox has no new rows; start MinIO and repeat the `POST` with the **same** `Idempotency-Key`, expect `200`.

- [ ] **Step 9: Shutdown** — with the worker idle, `docker stop foc-supplier-worker` — Expected: log "Received SIGTERM…" then "worker stopped", exit well inside the 30 s grace. With a job running (temporarily use the failure switch and stop right as a retry starts) confirm the job finishes before the process exits.

No commit. Anything that does not behave as expected is a bug to fix before Task 17.

---

### Task 17: Docs and disclosure

**Files:** `README.md` (supplier-service), `SupplierServiceSpec.md`, `SupplierServiceArchitecture.md`, `../ai/usage-log.md`, `../README.md`

- [ ] **Step 1: `supplier-service/README.md`** — header pair; admin table: add `DELETE /api/v1/admin/suppliers/:id` (`200 {id, isDeleted: true}`; `404` unknown/already deleted; `403` for `user`; the suspension task is committed to the outbox with the delete); change the `POST` row's reactivation wording to "applies the submitted details and photos through the edit cycle and restores `is_deleted = false`/`is_active = true` in the same transaction (new photos replace the old ones)"; add a "Background worker" section: `npm run worker` / `docker compose up -d supplier-worker`; BullMQ; separate process; **outbox relay every second moves `outbox` rows into BullMQ, oldest supplier version first, then id, and deletes each row once enqueued**; consumes `queue:supplier:suspension` and `queue:image:cleanup`; failed jobs are retried by delayed jobs after 5 s, 25 s, 125 s, 625 s (5 attempts), then a `dead_letter_jobs` row (`UNRESOLVED`); bad jobs and unroutable outbox rows go straight to the dead letter; Order/Message calls are logging mocks and `MOCK_DOWNSTREAM_FAILURE=true` forces failure; `SIGTERM` lets the active job finish; `PHOTO_STORE_ENDPOINT` must be the same string in the API and the worker (`http://host.docker.internal:9000` in development). Add to the "Upgrading an existing database" section: run `npm run migrate` to create the `outbox` table. Update the earlier photo-store text if it names `localhost:9000`. Behaviour only, no rationale.

- [ ] **Step 2: `SupplierServiceSpec.md`** — header pair; at the end of Phase 4's Scope add a status note in the Phase 3 style (only what was built and verified; state anything unverified). Record the team's decisions under Phase 4 Scope: transactional outbox (table columns, supplier version, relay every second via BullMQ job scheduler, delete after enqueue), BullMQ retries, dead-letter for bad jobs, separate worker container, `id` body, version bump. In Phase 2 Scope replace the reactivation sentences about "replace … photo rows" with the new flow (edit cycle attempted first, flags restored in the same transaction, `version` bumped once), and remove the "Deferred to later phases: deleting the cloud objects of photos replaced on reactivation" bullet. In Phase 3 Scope replace the "post-commit enqueue … producer-only" status note with "cleanup tasks are written to the outbox in the update transaction". Do not touch acceptance criteria.

- [ ] **Step 3: `SupplierServiceArchitecture.md`** — header pair; **record only** the team's answers where the text now differs: §6.4 the `outbox` table (columns as answered, DDL as in Task 3); §6.2/§7 reactivation flow; §8.1 delete workflow (the delete and its outbox row commit together, the response follows the commit, a relay enqueues into BullMQ and deletes the row after a successful enqueue) and job mechanism (BullMQ: job name/data carry `task_name`/`payload`, job id `outbox-<outbox id>`, retries are delayed jobs, queue keys as split in reading 9); §8.2 steps 5–6 (excluded-photo cleanup tasks are written to the outbox in the update transaction rather than enqueued after commit); §7 delete response body. Use the team's wording; add no rationale.

- [ ] **Step 4: `ai/usage-log.md`** — append one entry in the root `AGENTS.md` §5.2 format: `Phase 4: Admin soft-delete, transactional outbox and downstream worker`; Governing decision = Spec Phase 4, Arch §7/§7.5/§8.1/§8.2 and the team answers of 2026-09-30 (all four rounds); **Prompts (exact)** = the user's messages verbatim (`Based on  @SupplierServiceSpec, plan phase 4`, the four AskUserQuestion answers of round 1, the round-2 message with its 7 readings and 2 open items, the round-3 message, the round-4 message and its four AskUserQuestion answers, and any execution prompt); every file created/modified/deleted, listing `package.json`, `package-lock.json`, `compose.yaml` and `src/db/init.sql` explicitly (the first two cannot carry headers); "Deviations / questions raised" = the questions asked, the readings and residual notes; the `bullmq` version installed; verification exactly as run in Task 16 (state anything not run, including MinIO tests if not run). Leave both review fields blank.

- [ ] **Step 5: Root `README.md`** — one Log index row (date, `supplier-service`, title exactly as in the log, under 15 words, e.g. "Added soft-delete, transactional outbox, BullMQ worker and container; reworked reactivation").

- [ ] **Step 6: Commit** — `git add README.md SupplierServiceSpec.md SupplierServiceArchitecture.md ../ai/usage-log.md ../README.md && git commit -m "docs(supplier-service): document Phase 4 outbox, delete, worker and reactivation and log the implementation"`

- [ ] **Step 7: Remind the team** which entries and file headers still need `Author review`, and that readings 1, 3 and 7 need confirmation (table DDL, ordering guarantee, and the Arch §8.1/§8.2 text change).

---

## Self-review

**Spec coverage (Phase 4):** `DELETE` sets `is_deleted`, answers after the commit with the suspension task committed alongside it → Tasks 4–6. Worker consuming `{id, task_name, payload}` jobs, Order delete then Message notify (F8.4.2, F8.4.3) → Tasks 10–13. Exponential backoff, max 5 attempts, `dead_letter_jobs` on exhaustion → Tasks 2, 9, 11 (BullMQ attempts/backoff; processor writes the row on the last attempt). Same worker/queue for the Phase 3 excluded-photo job → Tasks 7, 10, 13 (cleanup tasks written to the outbox in the update transaction; `image_cleanup` handler; both queues). F8.4.1 (hidden at once; `is_active` untouched) → Task 4 SQL. Mocked Order/Message contracts → Task 10. Round-2 answers: `id` body (Task 5), version bump (Task 4), BullMQ with delayed retries (Tasks 2, 11, 13), bad jobs to the dead letter (Tasks 10, 11, 12), shutdown (Task 13), idempotency (Task 15), reactivation rework (Task 8), worker container (Task 14). Round-3: edit before flag commit (Task 8, one transaction), photo-store endpoint (Task 14). Round-4: outbox table with `id`, task name, payload, version = supplier version (Task 3, 4, 7), all enqueues through it (Tasks 4, 7, 8), every-second BullMQ job scheduler in the worker (Task 12), delete after successful enqueue (Task 12). Gaps found and flagged rather than filled: execution-order guarantee (reading 3), outbox growth (reading 8), the changed Arch §8.1/§8.2 text (reading 7).

**Placeholders:** none in code steps. Task 16 is manual by nature; it lists exact commands and expected results. Steps that tell the implementer to read a file first (`s3PhotoStorage.minio.test.ts`, `supplierUpdateService.test.ts`, `supplierCreationService.test.ts`) or grep for existing fakes do so because those files were not fully read during planning.

**Type consistency:** `OutboxTask {taskName, payload}` and `buildSuspensionTask`/`buildPhotoCleanupTask`/`queueKeyForTask` (Task 1; used in Tasks 4, 5, 7, 12); `softDelete(supplierId, now, tasks: OutboxTask[]): Promise<boolean>` (Tasks 4, 5 and their fakes); `SupplierChange.onPhotosRemoved?: (removed: CurrentPhoto[]) => OutboxTask[]` and `SupplierChange.reactivate?: boolean` (Tasks 7, 8; repo/service/tests); `insertOutboxRows(conn, version, tasks)` (Task 3; used in Tasks 4, 7); `OutboxRow {id, taskName, payload, version}` and `OutboxRepository {fetchBatch, delete}` (Tasks 3, 12); `SupplierUpdateService.updateSupplier(id, input, files, options?)` without a `queue` dependency (Tasks 7, 8, creation service, app); `reactivateSupplier` removed everywhere (Task 8); `createBullJobQueue` returns `JobQueue & {close}` (Tasks 2, 12, 13); `splitQueueKey`/`backoffStrategy`/`DEFAULT_JOB_OPTIONS` (Tasks 2, 12, 13); `JobHandler` (Tasks 10, 11); `ProcessableJob`/`createJobProcessor({handlers, deadLetters, log, clock})` returning a function (Tasks 11, 13); `DeadLetterEntry` fields `jobId/taskName/payload/errorTrace/failedAt` (Tasks 9, 11, 12); `createOutboxRelay({outbox, queue, deadLetters, log, clock})` returning `relayOnce(): Promise<number>` and `startRelay(connection, relayOnce, log?)` returning `{close}` (Tasks 12, 13); `UpdateSupplierInput` fields as in `src/validation/supplierUpdateInput.ts` (Task 8).
