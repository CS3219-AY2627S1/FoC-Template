/**
 * AI Assistance Disclosure
 * Tool: Claude Code (Claude Opus 5)
 * Scope: Generated the open reports and open appeals queues on the users page.
 * Reviewed by Ngooi Jun Sen.
 *
 * Each queue has a close action (dismiss a report, reject an appeal) and a
 * shortcut to the decision it is about (suspend the reported user, reinstate
 * the appellant). Suspending closes that user's open reports and reinstating
 * closes their open appeal, both on the Admin Service, so after any action
 * both queues and the users table are read again.
 */

import { useEffect, useRef, useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { TextAreaField } from '../ui/Inputs';
import { ApiError, errorMessage } from '../../lib/api';
import { fetchAdminUser, reinstateUser, suspendUser, type AdminUser } from '../../lib/adminUsers';
import { formatElapsed } from '../../lib/format';
import {
  dismissReport,
  fetchOpenAppeals,
  fetchOpenReports,
  reassessAppeal,
  reassessReport,
  rejectAppeal,
  type SuspensionAppeal,
  type UserReport,
} from '../../lib/moderation';
import styles from './ModerationQueues.module.css';

type Pending =
  | { kind: 'dismiss'; report: UserReport }
  | { kind: 'suspend'; report: UserReport }
  | { kind: 'reject'; appeal: SuspensionAppeal }
  | { kind: 'reinstate'; appeal: SuspensionAppeal }
  | null;

const ASSESS_WAIT_MS = 180_000;

function reportVerdict(report: UserReport): string {
  if (report.aiCompletedAt == null) return 'The AI is assessing this report.';
  if (report.aiRecommendation == null) return 'The AI could not assess this report.';
  const confidence =
    report.aiConfidence === null ? '' : ` (${Math.round(report.aiConfidence * 100)}% confidence)`;
  if (report.aiRecommendation === 'dismiss') return `The AI would dismiss this report${confidence}.`;
  if (report.aiRecommendation === 'suspend') return `The AI would suspend this account${confidence}.`;
  return `The AI is unsure${confidence}.`;
}

function verdictLine(appeal: SuspensionAppeal): string {
  if (appeal.aiCompletedAt == null) return 'The AI is assessing this appeal.';
  if (appeal.aiRecommendation == null) return 'The AI could not assess this appeal.';
  const confidence =
    appeal.aiConfidence === null ? '' : ` (${Math.round(appeal.aiConfidence * 100)}% confidence)`;
  if (appeal.aiRecommendation === 'uphold') return `The AI would leave the suspension in place${confidence}.`;
  if (appeal.aiRecommendation === 'reinstate') return `The AI would reinstate the account${confidence}.`;
  return `The AI is unsure${confidence}.`;
}

interface ModerationQueuesProps {
  /** The signed-in admin, who is never offered a suspend of themselves. */
  myUserId: string | null;
  /** Bumped by the page when the users table changes, e.g. a suspension there. */
  reloadKey: number;
  /** Called after an action here, so the page re-reads the users table too. */
  onChanged: () => void;
}

export function ModerationQueues({ myUserId, reloadKey, onChanged }: ModerationQueuesProps) {
  const [reports, setReports] = useState<UserReport[] | null>(null);
  const [appeals, setAppeals] = useState<SuspensionAppeal[] | null>(null);
  // Reports and appeals carry only IDs. Null: no live account has that ID.
  const [people, setPeople] = useState<Record<string, AdminUser | null>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [working, setWorking] = useState(false);
  const [reassessingId, setReassessingId] = useState<string | null>(null);
  const [reassessNote, setReassessNote] = useState<{ id: string; text: string } | null>(null);
  const pollToken = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    pollToken.current += 1;

    async function load(quiet: boolean) {
      if (!quiet) setLoadError(null);
      try {
        const [openReports, openAppeals] = await Promise.all([fetchOpenReports(), fetchOpenAppeals()]);
        const ids = new Set<string>();
        openReports.forEach((report) => ids.add(report.reporterUserId).add(report.reportedUserId));
        openAppeals.forEach((appeal) => ids.add(appeal.userId));

        // One lookup per person. Looked up again on every reload, since a
        // status shown here (suspended or not) decides which button appears.
        const found = await Promise.all(
          [...ids].map(async (id) => [id, await fetchAdminUser(id).catch(() => null)] as const),
        );
        if (cancelled) return;
        setPeople(Object.fromEntries(found));
        setReports(openReports);
        setAppeals(openAppeals);
        const waiting =
          openAppeals.some((appeal) => appeal.aiCompletedAt == null) ||
          openReports.some((report) => report.aiCompletedAt == null);
        if (waiting && Date.now() - started < ASSESS_WAIT_MS) {
          timer = setTimeout(() => void load(true), 3000);
        }
      } catch (error: unknown) {
        if (cancelled || quiet) return;
        setReports([]);
        setAppeals([]);
        setLoadError(errorMessage(error, 'Could not load reports and appeals from the Admin Service.'));
      }
    }

    void load(false);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reloadKey]);

  function nameOf(userId: string): string {
    return people[userId]?.name ?? 'Deleted account';
  }

  async function confirmPending() {
    if (pending === null || pending.kind === 'reject') return;

    setWorking(true);
    setActionError(null);
    try {
      if (pending.kind === 'dismiss') await dismissReport(pending.report.id);
      if (pending.kind === 'suspend') await suspendUser(pending.report.reportedUserId);
      if (pending.kind === 'reinstate') await reinstateUser(pending.appeal.userId);
    } catch (error) {
      // 409: another admin closed it first. The reload below shows the queue
      // as it is now, so that is not an error worth more than a line.
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'Someone else already closed that one. The queue has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
    } finally {
      setWorking(false);
      setPending(null);
      onChanged();
    }
  }

  async function rerunReport(report: UserReport) {
    const startedAt = report.aiCompletedAt;
    const token = ++pollToken.current;
    setReassessingId(report.id);
    setReassessNote(null);
    setActionError(null);
    try {
      await reassessReport(report.id);
    } catch (error) {
      if (pollToken.current !== token) return;
      setReassessingId(null);
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'This report is no longer open. The queue has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
      return;
    }

    const deadline = Date.now() + ASSESS_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (pollToken.current !== token) return;
      try {
        const next = await fetchOpenReports();
        if (pollToken.current !== token) return;
        const updated = next.find((row) => row.id === report.id);
        if (updated === undefined || updated.aiCompletedAt !== startedAt) {
          setReports(next);
          setReassessingId(null);
          return;
        }
      } catch {
        // Keep the last verdict on screen and try again until the wait ends.
      }
    }
    if (pollToken.current !== token) return;
    setReassessingId(null);
    setReassessNote({
      id: report.id,
      text: 'The AI could not assess this report again. The previous verdict is unchanged.',
    });
  }

  async function rerun(appeal: SuspensionAppeal) {
    const startedAt = appeal.aiCompletedAt;
    const token = ++pollToken.current;
    setReassessingId(appeal.id);
    setReassessNote(null);
    setActionError(null);
    try {
      await reassessAppeal(appeal.id);
    } catch (error) {
      if (pollToken.current !== token) return;
      setReassessingId(null);
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'This appeal is no longer open. The queue has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
      return;
    }

    const deadline = Date.now() + ASSESS_WAIT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (pollToken.current !== token) return;
      try {
        const next = await fetchOpenAppeals();
        if (pollToken.current !== token) return;
        const updated = next.find((row) => row.id === appeal.id);
        if (updated === undefined || updated.aiCompletedAt !== startedAt) {
          setAppeals(next);
          setReassessingId(null);
          return;
        }
      } catch {
        // Keep the last verdict on screen and try again until the wait ends.
      }
    }
    if (pollToken.current !== token) return;
    setReassessingId(null);
    setReassessNote({
      id: appeal.id,
      text: 'The AI could not assess this appeal again. The previous verdict is unchanged.',
    });
  }

  async function confirmReject() {
    if (pending?.kind !== 'reject' || rejectReason.trim() === '') return;

    setWorking(true);
    setActionError(null);
    try {
      await rejectAppeal(pending.appeal.id, rejectReason.trim());
    } catch (error) {
      setActionError(
        error instanceof ApiError && error.status === 409
          ? 'Someone else already closed that one. The queue has been refreshed.'
          : errorMessage(error, 'Could not reach the Admin Service, so nothing changed.'),
      );
    } finally {
      setWorking(false);
      setPending(null);
      setRejectReason('');
      onChanged();
    }
  }

  const confirming = pending !== null && pending.kind !== 'reject';
  const rejecting = pending?.kind === 'reject' ? pending.appeal : null;
  const dialog = describe(pending !== null && pending.kind !== 'reject' ? pending : null, nameOf);

  return (
    <section className={styles.queues} aria-label="Reports and appeals">
      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}
      {actionError ? <Alert variant="warning">{actionError}</Alert> : null}

      <div className={styles.queue}>
        <h2 className={styles.heading}>
          Open reports
          <span className={styles.count}>{reports === null ? '' : reports.length}</span>
        </h2>

        {reports !== null && reports.length === 0 && loadError === null ? (
          <p className={styles.empty}>No open reports.</p>
        ) : null}

        {reports !== null && reports.length > 0 ? (
          <ul className={styles.list}>
            {reports.map((report) => {
              const reported = people[report.reportedUserId];
              const suspended = reported?.status === 'Suspended';
              const openAppeal = appeals?.find((appeal) => appeal.userId === report.reportedUserId);
              return (
                <li key={report.id} className={styles.item}>
                  <div className={styles.meta}>
                    <span className={styles.who}>
                      {nameOf(report.reportedUserId)}
                      {suspended ? <span className={styles.suspended}>Suspended</span> : null}
                    </span>
                    <span className={styles.sub}>
                      Reported by {nameOf(report.reporterUserId)} ·{' '}
                      {formatElapsed(new Date(report.createdAt))}
                    </span>
                  </div>
                  <p className={styles.label}>Report</p>
                  <p className={styles.text}>{report.comment}</p>
                  <p className={styles.verdict}>{reportVerdict(report)}</p>
                  {report.aiReasoning ? <p className={styles.note}>{report.aiReasoning}</p> : null}
                  {reassessingId === report.id ? (
                    <p className={styles.note}>Running the AI again. This can take a minute.</p>
                  ) : null}
                  {reassessNote?.id === report.id ? <Alert variant="warning">{reassessNote.text}</Alert> : null}
                  {openAppeal ? <AppealTexts appeal={openAppeal} showReports={false} /> : null}
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      loading={reassessingId === report.id}
                      onClick={() => void rerunReport(report)}
                    >
                      Run AI again
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPending({ kind: 'dismiss', report })}
                    >
                      Dismiss
                    </Button>
                    {/* Nothing to suspend if the account is gone or already
                        suspended, and an admin never suspends themselves. */}
                    {reported && !suspended && reported.userId !== myUserId ? (
                      <Button
                        variant="danger"
                        onClick={() => setPending({ kind: 'suspend', report })}
                      >
                        Suspend {reported.name}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div className={styles.queue}>
        <h2 className={styles.heading}>
          Open appeals
          <span className={styles.count}>{appeals === null ? '' : appeals.length}</span>
        </h2>

        {appeals !== null && appeals.length === 0 && loadError === null ? (
          <p className={styles.empty}>No open appeals.</p>
        ) : null}

        {appeals !== null && appeals.length > 0 ? (
          <ul className={styles.list}>
            {appeals.map((appeal) => {
              const appellant = people[appeal.userId];
              return (
                <li key={appeal.id} className={styles.item}>
                  <div className={styles.meta}>
                    <span className={styles.who}>{nameOf(appeal.userId)}</span>
                    <span className={styles.sub}>
                      {appellant ? `${appellant.email} · ` : ''}
                      {formatElapsed(new Date(appeal.createdAt))}
                    </span>
                  </div>
                  <AppealTexts appeal={appeal} showReports />
                  {reassessingId === appeal.id ? (
                    <p className={styles.note}>Running the AI again. This can take a minute.</p>
                  ) : null}
                  {reassessNote?.id === appeal.id ? (
                    <Alert variant="warning">{reassessNote.text}</Alert>
                  ) : null}
                  <div className={styles.actions}>
                    <Button
                      variant="secondary"
                      loading={reassessingId === appeal.id}
                      onClick={() => void rerun(appeal)}
                    >
                      Run AI again
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setRejectReason('');
                        setPending({ kind: 'reject', appeal });
                      }}
                    >
                      Reject
                    </Button>
                    {appellant?.status === 'Suspended' ? (
                      <Button onClick={() => setPending({ kind: 'reinstate', appeal })}>
                        Reinstate {appellant.name}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {/* NFR9.1.1: every action here asks first. */}
      <ConfirmDialog
        open={confirming}
        title={dialog.title}
        consequence={dialog.consequence}
        confirmLabel={dialog.confirmLabel}
        destructive={pending?.kind === 'suspend'}
        busy={working}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />

      <Dialog
        open={rejecting !== null}
        title="Reject this appeal?"
        onClose={() => {
          if (!working) setPending(null);
        }}
        footer={
          <>
            <Button variant="secondary" disabled={working} onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={rejectReason.trim() === '' || rejectReason.trim().length > 4000}
              loading={working}
              onClick={() => void confirmReject()}
            >
              Reject
            </Button>
          </>
        }
      >
        <div className={styles.rejectBody}>
          <p className={styles.rejectCopy}>
            {rejecting ? `${nameOf(rejecting.userId)} stays suspended.` : ''} The reason is stored
            on the appeal. They can send another appeal later.
          </p>
          <TextAreaField
            label="Reason"
            rows={4}
            maxLength={4000}
            value={rejectReason}
            onChange={(event) => setRejectReason(event.target.value)}
          />
        </div>
      </Dialog>
    </section>
  );
}

function AppealTexts({ appeal, showReports }: { appeal: SuspensionAppeal; showReports: boolean }) {
  const reports = appeal.reports ?? [];
  return (
    <>
      {showReports ? (
        <>
          <p className={styles.label}>Reports</p>
          {reports.length === 0 ? (
            <p className={styles.text}>No reports on file.</p>
          ) : (
            reports.map((report) => (
              <p key={report.id} className={styles.text}>
                {report.comment}
              </p>
            ))
          )}
          <p className={styles.label}>Appeal</p>
          <p className={styles.text}>{appeal.message}</p>
        </>
      ) : (
        <>
          <p className={styles.label}>Appeal</p>
          <p className={styles.text}>{appeal.message}</p>
        </>
      )}
      <p className={styles.verdict}>{verdictLine(appeal)}</p>
      {appeal.aiReasoning ? <p className={styles.note}>{appeal.aiReasoning}</p> : null}
    </>
  );
}

function describe(pending: Exclude<Pending, { kind: 'reject' }>, nameOf: (userId: string) => string) {
  if (pending === null) return { title: '', consequence: null, confirmLabel: '' };
  switch (pending.kind) {
    case 'dismiss':
      return {
        title: 'Dismiss this report?',
        consequence: `The report is closed and ${nameOf(pending.report.reportedUserId)} is not suspended. The reporter is not told.`,
        confirmLabel: 'Dismiss',
      };
    case 'suspend':
      return {
        title: 'Suspend this account?',
        consequence: `${nameOf(pending.report.reportedUserId)} is blocked from logging in and from every action, within a minute. Every open report about them is closed. They can send an appeal from the login page.`,
        confirmLabel: 'Suspend',
      };
    case 'reinstate':
      return {
        title: 'Reinstate this account?',
        consequence: `${nameOf(pending.appeal.userId)} can log in and act again, within a minute. Their appeal is closed.`,
        confirmLabel: 'Reinstate',
      };
  }
}
