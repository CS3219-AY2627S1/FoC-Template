/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5.5), date: 2026-11-02
 * Scope: Generated the escalation review page against UI FR18 and the Admin
 *        Service conflict endpoints, with no mockup to work from.
 * Reviewed by Ngooi Jun Sen.
 *
 * Cases are listed soonest deadline first. Opening one shows the reporter's
 * comment and the AI's verdict; the admin claims it ("Start review", which
 * Order shows as Under Review) and then picks who was at fault.
 *
 * What a case does not carry, and the page therefore cannot show: the order
 * itself (Order returns an order to its requester and courier only, not to
 * admins). Evidence photos are loaded from the Admin Service while the case
 * is open. Resolving the case deletes them.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Dialog } from '../components/ui/Dialog';
import { useAuth } from '../auth/AuthProvider';
import { adminCountsChanged } from '../lib/adminCounts';
import { ApiError, errorMessage } from '../lib/api';
import { fetchAdminUser } from '../lib/adminUsers';
import {
  FAULT_PARTIES,
  claimConflict,
  evidenceRoles,
  faultLabel,
  fetchConflict,
  fetchConflictPhoto,
  fetchConflicts,
  isDueSoon,
  isOpen,
  reassessConflict,
  resolveConflict,
  type EvidenceRole,
  type ConflictDetail,
  type ConflictStatus,
  type ConflictSummary,
  type FaultParty,
} from '../lib/conflicts';
import { formatElapsed, formatUntil, formatWhen } from '../lib/format';
import { orderReference } from '../lib/orders';
import styles from './AdminEscalationsPage.module.css';

type Filter = 'open' | 'resolved' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All' },
];

const STATUS_LABELS: Record<ConflictStatus, string> = {
  created: 'AI assessing',
  ai_evaluated: 'Ready',
  ai_failed: 'Ready, no AI verdict',
  under_review: 'Under review',
  resolved: 'Resolved',
};

function percent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/** One line on what the AI made of it, for the list and the dialog. */
function verdictLine(row: ConflictSummary): string {
  if (row.status === 'created') return 'Waiting for the AI assessment';
  if (row.aiFaultParty === null) return 'The AI could not assess this case';
  return `AI: ${faultLabel(row.aiFaultParty)} at fault, ${percent(row.aiConfidence ?? 0)} confident`;
}

export function AdminEscalationsPage() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState<Filter>('open');
  const [rows, setRows] = useState<ConflictSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRows(await fetchConflicts());
    } catch (error) {
      setRows([]);
      setLoadError(errorMessage(error, 'Could not load escalations from the Admin Service.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = (rows ?? []).filter((row) =>
    filter === 'all' ? true : filter === 'open' ? isOpen(row.status) : !isOpen(row.status),
  );
  const openCount = (rows ?? []).filter((row) => isOpen(row.status)).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Escalations
          <span className={styles.subtitle}>{rows === null ? 'Loading' : `${openCount} open`}</span>
        </h1>

        <div className={styles.filters} role="tablist" aria-label="Status">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={filter === option.value}
              className={filter === option.value ? `${styles.filter} ${styles.filterActive}` : styles.filter}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}

      {rows !== null && shown.length === 0 && loadError === null ? (
        <p className={styles.empty}>
          {filter === 'resolved' ? 'No resolved cases yet.' : 'No open escalations.'}
        </p>
      ) : null}

      {shown.length > 0 ? (
        <ul className={styles.list}>
          {shown.map((row) => {
            const deadline = new Date(row.resolutionDeadline);
            return (
              <li key={row.id} className={styles.item}>
                <div className={styles.itemText}>
                  <p className={styles.itemTitle}>
                    Order #{orderReference(row.orderId)}
                    <span className={styles[row.status]}>{STATUS_LABELS[row.status]}</span>
                    {/* F3.7.1: the deadline reminder has fired for this case. */}
                    {isDueSoon(row) ? <span className={styles.dueSoon}>Due soon</span> : null}
                  </p>
                  <p className={styles.itemNote}>{verdictLine(row)}</p>
                  {isOpen(row.status) ? (
                    <p className={styles.itemNote}>
                      {deadline.getTime() > Date.now()
                        ? `Deadline ${formatWhen(deadline)}, ${formatUntil(deadline)}`
                        : 'Deadline passed'}
                    </p>
                  ) : null}
                </div>
                <Button variant="secondary" onClick={() => setOpenCaseId(row.id)}>
                  {row.status === 'resolved' ? 'View' : 'Open'}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <CaseDialog
        caseId={openCaseId}
        myUserId={me?.userId ?? null}
        onClose={() => setOpenCaseId(null)}
        onChanged={() => {
          void load();
          adminCountsChanged();
        }}
      />
    </div>
  );
}

interface CaseDialogProps {
  caseId: string | null;
  myUserId: string | null;
  onClose: () => void;
  /** After a claim or resolve, so the list shows the new status. */
  onChanged: () => void;
}

const PHOTO_LABELS: Record<EvidenceRole, string> = {
  collection: 'Collection',
  delivery: 'Delivery',
  dispute: 'Dispute',
};

/** Gemini's own timeout is 60s and it retries twice, so wait past that. */
const REASSESS_WAIT_MS = 200_000;

function EvidencePhotos({ caseId, keys }: { caseId: string; keys: string[] }) {
  const roles = evidenceRoles(keys);
  const roleKey = roles.join('|');
  const [photos, setPhotos] = useState<{ role: EvidenceRole; url: string | null }[] | null>(null);

  useEffect(() => {
    const loading = roleKey.length === 0 ? [] : (roleKey.split('|') as EvidenceRole[]);
    let cancelled = false;
    const created: string[] = [];
    setPhotos(loading.length === 0 ? [] : null);
    void (async () => {
      const loaded = await Promise.all(
        loading.map(async (role) => {
          try {
            const blob = await fetchConflictPhoto(caseId, role);
            const url = URL.createObjectURL(blob);
            if (cancelled) {
              URL.revokeObjectURL(url);
              return { role, url: null };
            }
            created.push(url);
            return { role, url };
          } catch {
            return { role, url: null };
          }
        }),
      );
      if (!cancelled) setPhotos(loaded);
    })();
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [caseId, roleKey]);

  if (roles.length === 0) return null;
  if (photos === null) return <p className={styles.note}>Loading photos…</p>;

  return (
    <div className={styles.photos}>
      {photos.map((photo) => (
        <figure key={photo.role} className={styles.photo}>
          <figcaption className={styles.label}>{PHOTO_LABELS[photo.role]}</figcaption>
          {photo.url ? (
            <img src={photo.url} alt={`${PHOTO_LABELS[photo.role]} photo`} />
          ) : (
            <p className={styles.note}>This photo is no longer available.</p>
          )}
        </figure>
      ))}
    </div>
  );
}

function CaseDialog({ caseId, myUserId, onClose, onChanged }: CaseDialogProps) {
  const [detail, setDetail] = useState<ConflictDetail | null>(null);
  const [reporterName, setReporterName] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reassessNote, setReassessNote] = useState<string | null>(null);
  const [fault, setFault] = useState<FaultParty | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [reassessing, setReassessing] = useState(false);
  const pollToken = useRef(0);

  const load = useCallback(async (id: string) => {
    setLoadError(null);
    try {
      const found = await fetchConflict(id);
      setDetail(found);
      // Start from the AI's call; the admin can change it.
      setFault(found.resolvedFaultParty ?? found.aiFaultParty);
      const reporter = await fetchAdminUser(found.reporterUserId).catch(() => null);
      setReporterName(reporter?.name ?? 'Deleted account');
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this case from the Admin Service.'));
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    setReporterName(null);
    setActionError(null);
    setReassessNote(null);
    setConfirming(false);
    setReassessing(false);
    pollToken.current += 1;
    if (caseId !== null) void load(caseId);
  }, [caseId, load]);

  async function rerun() {
    if (detail === null) return;
    const startedAt = detail.aiCompletedAt;
    const token = ++pollToken.current;
    setReassessing(true);
    setReassessNote(null);
    setActionError(null);
    try {
      await reassessConflict(detail.id);
    } catch (error) {
      if (pollToken.current !== token) return;
      setReassessing(false);
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'This case changed before your action went through. It has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
      return;
    }

    const deadline = Date.now() + REASSESS_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (pollToken.current !== token) return;
      try {
        const next = await fetchConflict(detail.id);
        if (pollToken.current !== token) return;
        if (next.aiCompletedAt !== startedAt) {
          setDetail(next);
          setFault(next.resolvedFaultParty ?? next.aiFaultParty);
          setReassessing(false);
          onChanged();
          return;
        }
      } catch {
        // Keep the last verdict on screen and try again until the wait ends.
      }
    }
    if (pollToken.current !== token) return;
    setReassessing(false);
    setReassessNote('The AI could not assess this case again. The previous verdict is unchanged.');
  }

  async function act(action: () => Promise<void>) {
    if (detail === null) return;
    setWorking(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      // 409: another admin got there first, or the deadline resolved it.
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'This case changed before your action went through. It has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
    } finally {
      setWorking(false);
      setConfirming(false);
      onChanged();
      await load(detail.id);
    }
  }

  const mine = detail?.reviewStartedByAdminId != null && detail.reviewStartedByAdminId === myUserId;
  const claimable = detail?.status === 'ai_evaluated' || detail?.status === 'ai_failed';
  const resolvable = detail?.status === 'under_review' && mine;

  let footer = null;
  if (detail !== null && claimable) {
    footer = (
      <>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button loading={working} onClick={() => void act(() => claimConflict(detail.id))}>
          Start review
        </Button>
      </>
    );
  } else if (detail !== null && resolvable) {
    footer = confirming ? (
      <>
        <Button variant="secondary" disabled={working} onClick={() => setConfirming(false)}>
          Back
        </Button>
        <Button
          loading={working}
          onClick={() => fault !== null && void act(() => resolveConflict(detail, fault))}
        >
          Confirm
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="secondary"
          loading={reassessing}
          disabled={confirming}
          onClick={() => void rerun()}
        >
          Run AI again
        </Button>
        <Button disabled={fault === null || reassessing} onClick={() => setConfirming(true)}>
          Resolve
        </Button>
      </>
    );
  } else {
    footer = (
      <Button variant="secondary" onClick={onClose}>
        Close
      </Button>
    );
  }

  return (
    <Dialog
      open={caseId !== null}
      title={detail === null ? 'Escalation' : `Order #${orderReference(detail.orderId)}`}
      onClose={onClose}
      wide
      footer={footer}
    >
      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}
      {actionError ? <Alert variant="warning">{actionError}</Alert> : null}

      {detail === null ? (
        loadError === null ? <p className={styles.note}>Loading</p> : null
      ) : (
        <div className={styles.case}>
          <section className={styles.block}>
            <p className={styles.label}>
              Reported by {reporterName ?? '…'} · {formatElapsed(new Date(detail.createdAt))}
            </p>
            <p className={styles.comment}>{detail.comment}</p>
            {detail.evidencePhotoUrls.length === 0 ? (
              <p className={styles.note}>No photos attached.</p>
            ) : detail.status === 'resolved' ? (
              <p className={styles.note}>Photos were removed when this case was resolved.</p>
            ) : (
              <EvidencePhotos caseId={detail.id} keys={detail.evidencePhotoUrls} />
            )}
          </section>

          <section className={styles.block}>
            <p className={styles.label}>AI assessment</p>
            <p className={styles.verdict}>{verdictLine(detail)}</p>
            {reassessing ? <p className={styles.note}>Running the AI again. This can take a minute.</p> : null}
            {reassessNote ? <Alert variant="warning">{reassessNote}</Alert> : null}
            {detail.aiReasoning ? <p className={styles.note}>{detail.aiReasoning}</p> : null}
          </section>

          {detail.status === 'resolved' && detail.resolvedFaultParty !== null ? (
            <section className={styles.block}>
              <p className={styles.label}>Outcome</p>
              <p className={styles.verdict}>{faultLabel(detail.resolvedFaultParty)} at fault</p>
              <p className={styles.note}>
                {detail.resolvedAutomatically
                  ? 'Resolved automatically on the AI verdict when the deadline passed'
                  : detail.resolvedByAdminId === myUserId
                    ? 'Resolved by you'
                    : 'Resolved by another admin'}
                {detail.resolvedAt ? `, ${formatWhen(new Date(detail.resolvedAt))}.` : '.'}
              </p>
            </section>
          ) : null}

          {detail.status === 'under_review' && !mine ? (
            <Alert variant="warning">Another admin is reviewing this case.</Alert>
          ) : null}

          {claimable ? (
            <p className={styles.note}>
              Starting the review assigns the case to you and shows the order as Under Review to both
              people on it.
            </p>
          ) : null}

          {resolvable ? (
            <section className={styles.block}>
              <p className={styles.label} id="fault-label">
                Who was at fault?
              </p>
              <div className={styles.choices} role="group" aria-labelledby="fault-label">
                {FAULT_PARTIES.map((option) => (
                  <Chip
                    key={option.value}
                    selected={fault === option.value}
                    disabled={confirming}
                    onClick={() => setFault(option.value)}
                  >
                    {option.label}
                    {detail.aiFaultParty === option.value ? ' (AI)' : ''}
                  </Chip>
                ))}
              </div>
              {confirming && fault !== null ? (
                <Alert variant="warning">
                  {fault === 'no-fault'
                    ? 'Resolve as no fault?'
                    : `Resolve with the ${faultLabel(fault).toLowerCase()} at fault?`}{' '}
                  Order completes the order on this outcome, and it cannot be changed afterwards.
                </Alert>
              ) : null}
            </section>
          ) : null}

          {isOpen(detail.status) ? (
            <p className={styles.note}>
              Deadline {formatWhen(new Date(detail.resolutionDeadline))}. If it passes, the case resolves
              on the AI verdict when that verdict is confident enough.
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
