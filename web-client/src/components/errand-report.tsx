// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-29, 2026-11-08, 2026-11-10
// Scope: Implemented the errand problem report panel for participants; added the disputed-errand
// workflow with a selected problem, private details and withdrawal.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useEffect, useRef, useState } from "react";
import { disputeReports, OPEN_DISPUTE, type DisputeReport } from "../api/admin-service";
import { isApiRequestError } from "../api/client";
import { failureReasons, type FailureReason, type OrderState } from "../api/order-service";
import { clearDraft, closingReasonLabel, disputeOutcome, problemLabel, readDraft, writeDraft } from "../app/admin-presentation";
import { orderError, orderTime } from "../app/order-presentation";
import { useAuth } from "../app/use-auth";
import { DisputeBadge } from "./admin-ui";

// Order holds an errand in DISPUTED only from these states.
const REPORTABLE_STATES: OrderState[] = ["ACCEPTED", "PICKED_UP", "DELIVERED"];

const messages: Record<string, string> = {
  DISPUTE_ALREADY_OPEN: "A problem with this errand is already being reviewed. Add your details to it instead.",
  REPORT_NOT_ALLOWED: "Problems can be reported only while a courier is working on the errand.",
  WITHDRAWAL_NOT_ALLOWED: "An administrator has started reviewing this report, so it can no longer be withdrawn. Send your update as details instead.",
  DISPUTE_CLOSED: "This dispute has closed, so it no longer accepts details.",
  ERRAND_CHANGED: "The errand changed. Refresh to see its current state.",
  VERSION_CONFLICT: "This report changed. Refresh to see its current status.",
  ORDER_NOT_FOUND: "Only the requester or courier can report a problem with this errand.",
  DISPUTE_NOT_FOUND: "Only the reporter can withdraw this report.",
  ORDER_UNAVAILABLE: "Errand records are unavailable, so nothing was sent. Try again.",
  IDEMPOTENCY_KEY_REUSED: "This form was already used for something else. Reload the page and try again.",
};

function reportError(failure: unknown): string {
  return isApiRequestError(failure) && messages[failure.code] ? messages[failure.code] : orderError(failure);
}

// Lost responses are retried with the same request; definite refusals start a fresh one.
const ambiguous = (failure: unknown) =>
  !isApiRequestError(failure) || failure.status === 0 || failure.status >= 500;

const reporterNames = { REQUESTER: "requester", COURIER: "courier" } as const;

function origin(report: DisputeReport): string {
  if (report.ownReport) return "You reported a problem";
  return report.reporterRole ? `The ${reporterNames[report.reporterRole]} reported a problem` : "An administrator raised a problem";
}

type Draft = { problem: FailureReason | ""; details: string };

/** Runs one submission at a time; a second click before React re-renders is ignored. */
function useSubmission() {
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  async function run(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return { saving, run };
}

function ReportForm({ orderId, onReported }: { orderId: string; onReported: (report: DisputeReport) => void }) {
  const { withCurrentAccess } = useAuth();
  const draftKey = `errand-report-draft:${orderId}`;
  const [draft, setDraft] = useState<Draft>(() => readDraft(draftKey, { problem: "", details: "" }));
  // One key per report: retrying after an ambiguous failure returns the original (N2NFR3.3).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const { saving, run } = useSubmission();
  const other = draft.problem === "OTHER";
  const ready = draft.problem !== "" && (!other || draft.details.trim() !== "");

  function update(next: Draft) {
    setDraft(next);
    writeDraft(draftKey, next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || draft.problem === "") return;
    const problem = draft.problem;
    await run(async () => {
      setError(null);
      try {
        const report = await withCurrentAccess((token) => disputeReports.report(
          { orderId, problem, problemDetails: draft.details.trim() || null }, idempotencyKey, token,
        ));
        clearDraft(draftKey);
        setDraft({ problem: "", details: "" });
        setIdempotencyKey(crypto.randomUUID());
        onReported(report);
      } catch (failure) {
        setError(reportError(failure));
        if (!ambiguous(failure)) setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return <form onSubmit={submit}>
    <p className="order-muted">Reporting pauses the errand while an administrator reviews it. Both of you see the problem you select. If the administrator accepts it, the errand fails and the reward returns to the requester; otherwise the errand continues.</p>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    <label className="order-label">What went wrong
      <select disabled={saving} onChange={(event) => update({ ...draft, problem: event.target.value as Draft["problem"] })} required value={draft.problem}>
        <option value="">Select a problem</option>
        {Object.entries(failureReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {other ? <label className="order-label">Describe the problem (shown to both of you)
      <textarea disabled={saving} maxLength={500} onChange={(event) => update({ ...draft, details: event.target.value })} required rows={3} value={draft.details} />
    </label> : null}
    <button className="order-button" disabled={saving || !ready} type="submit">{saving ? "Sending…" : "Report problem"}</button>
  </form>;
}

function StatementForm({ report, onSent }: { report: DisputeReport; onSent: (report: DisputeReport) => void }) {
  const { withCurrentAccess } = useAuth();
  const draftKey = `dispute-statement-draft:${report.disputeId}`;
  const [body, setBody] = useState(() => readDraft(draftKey, ""));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const { saving, run } = useSubmission();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      setError(null);
      try {
        const updated = await withCurrentAccess((token) => disputeReports.addStatement(
          report.disputeId, body.trim(), idempotencyKey, token,
        ));
        clearDraft(draftKey);
        setBody("");
        setIdempotencyKey(crypto.randomUUID());
        onSent(updated);
      } catch (failure) {
        setError(reportError(failure));
        if (!ambiguous(failure)) setIdempotencyKey(crypto.randomUUID());
      }
    });
  }

  return <form onSubmit={submit}>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    <label className="order-label">Details for the administrator
      <textarea disabled={saving} maxLength={2000} onChange={(event) => { setBody(event.target.value); writeDraft(draftKey, event.target.value); }} required rows={3} value={body} />
    </label>
    <p className="order-muted">Only you and administrators read these details; the other participant does not.</p>
    <button className="order-button order-secondary" disabled={saving || !body.trim()} type="submit">{saving ? "Sending…" : "Send details"}</button>
  </form>;
}

function WithdrawForm({ report, onWithdrawn }: { report: DisputeReport; onWithdrawn: (report: DisputeReport) => void }) {
  const { withCurrentAccess } = useAuth();
  const draftKey = `dispute-withdraw-draft:${report.disputeId}`;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(() => readDraft(draftKey, ""));
  const [error, setError] = useState<string | null>(null);
  const { saving, run } = useSubmission();

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      setError(null);
      try {
        const updated = await withCurrentAccess((token) => disputeReports.withdraw(
          report.disputeId, reason.trim(), report.version, token,
        ));
        clearDraft(draftKey);
        onWithdrawn(updated);
      } catch (failure) {
        setError(reportError(failure));
      }
    });
  }

  if (!open) {
    return <button className="order-text-button" onClick={() => setOpen(true)} type="button">Withdraw report</button>;
  }
  return <form onSubmit={submit}>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    <label className="order-label">Why are you withdrawing? (shown to both of you)
      <textarea disabled={saving} maxLength={1000} onChange={(event) => { setReason(event.target.value); writeDraft(draftKey, event.target.value); }} required rows={2} value={reason} />
    </label>
    <div className="order-actions">
      <button className="order-button" disabled={saving || !reason.trim()} type="submit">{saving ? "Withdrawing…" : "Withdraw and continue the errand"}</button>
      <button className="order-button order-secondary" disabled={saving} onClick={() => setOpen(false)} type="button">Keep report</button>
    </div>
  </form>;
}

/**
 * N2F3.2: the requester or courier reports a problem, which holds the errand in DISPUTED until an
 * administrator accepts or rejects it or the reporter withdraws it. Both participants follow every
 * dispute and its outcome; each sees only their own details to administrators.
 */
export function ErrandReportPanel({ orderId, state, onErrandChanged }: {
  orderId: string; state: OrderState; onErrandChanged?: () => void;
}) {
  const { withCurrentAccess } = useAuth();
  const [reports, setReports] = useState<DisputeReport[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError(null);
    withCurrentAccess((token) => disputeReports.list({ orderId, pageSize: 50 }, token))
      .then((page) => { if (active) setReports(page.items); })
      .catch((failure) => { if (active) setLoadError(reportError(failure)); });
    return () => { active = false; };
  }, [orderId, reload, withCurrentAccess]);

  function replace(report: DisputeReport) {
    setReports((current) => [report, ...(current ?? []).filter((item) => item.disputeId !== report.disputeId)]);
  }

  // Opening or withdrawing a dispute moves the errand, so the page reloads it as well.
  function errandMoved(report: DisputeReport) {
    replace(report);
    setReload((n) => n + 1);
    onErrandChanged?.();
  }

  // Legacy disputes never held the errand, so they do not block a new report.
  const openReport = reports?.find((report) => OPEN_DISPUTE.includes(report.status) && !report.legacy) ?? null;
  const canReport = reports !== null && !openReport && REPORTABLE_STATES.includes(state);

  return <section aria-labelledby="errand-report-heading" className="order-panel">
    <h2 id="errand-report-heading">Report a problem</h2>
    {/* Not an alert: this side panel failing must not interrupt the errand's own messages. */}
    {loadError ? <p>{loadError} <button className="order-text-button" onClick={() => setReload((n) => n + 1)} type="button">Retry reports</button></p>
      : reports === null ? <p role="status">Loading reports…</p> : <>
        {reports.length ? <ol className="order-history">{reports.map((report) => {
          const isOpen = OPEN_DISPUTE.includes(report.status);
          return <li key={report.disputeId}>
            <DisputeBadge status={report.status} />
            <time dateTime={report.createdAt}>{origin(report)} {orderTime(report.createdAt)} SGT</time>
            <p><strong>Problem:</strong> {problemLabel(report)}</p>
            {report.resolutionReason ? <p><strong>{closingReasonLabel(report.status)}:</strong> {report.resolutionReason}</p> : null}
            {disputeOutcome(report) ? <p>{disputeOutcome(report)}</p> : null}
            {isOpen && !report.legacy ? <p className="order-muted">{report.status === "OPEN" ? "Waiting for an administrator to review it." : "An administrator is reviewing it."} The errand is on hold until then.</p> : null}
            {report.statements.length ? <div>
              <p><strong>Your details to the administrator</strong></p>
              <ul>{report.statements.map((statement) => <li key={statement.statementId}><p>{statement.body}</p><small>{orderTime(statement.createdAt)} SGT</small></li>)}</ul>
            </div> : null}
            {isOpen ? <StatementForm key={`statement:${report.disputeId}`} onSent={replace} report={report} /> : null}
            {isOpen && report.ownReport && report.status === "OPEN" && !report.legacy ? <WithdrawForm key={`withdraw:${report.disputeId}:${report.version}`} onWithdrawn={errandMoved} report={report} /> : null}
          </li>;
        })}</ol> : null}
        {canReport ? <ReportForm onReported={errandMoved} orderId={orderId} />
          : !reports.length ? <p className="order-muted">No problems reported.</p> : null}
      </>}
  </section>;
}
