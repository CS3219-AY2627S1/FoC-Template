// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
// 2026-11-10
// Scope: Implemented the dispute detail page and status form; added reporter origin, participant
// statements and accept or reject decisions that change the disputed errand.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { adminService, NEXT_STATUSES, type Dispute, type DisputeTarget } from "../api/admin-service";
import { adminCreditService, type Settlement } from "../api/credit-service";
import { adminOrderService, failureReasonLabel, failureReasons, stateNames, type OrderParticipant } from "../api/order-service";
import {
  adminError, clearDraft, closingReasonLabel, disputeOrigin, disputeOutcome, disputeStatusLabels, needsRefresh,
  noReservation, problemLabel, readDraft, shortId, writeDraft,
} from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";
import { useAdminResource } from "../app/use-admin-resource";
import { useAuth } from "../app/use-auth";
import { AdminFact, AdminPanel, DisputeBadge, OverdueFlag, SettlementFacts } from "../components/admin-ui";
import { OrderBadge } from "../components/order-ui";
import { WorkspaceShell } from "../components/workspace-shell";

const DESCRIPTION = "Oversee errands, disputes and platform analytics.";
const REASON_LIMIT = 1000;
const statementAuthors = { REQUESTER: "Requester", COURIER: "Courier" } as const;

type StatusFormProps = {
  dispute: Dispute;
  errand: OrderParticipant | null;
  settlement: Settlement | null;
  onChanged: () => void;
};

/** What accepting or rejecting will do to the errand, shown before the administrator confirms. */
function errandEffect(target: DisputeTarget, dispute: Dispute, errand: OrderParticipant, amount: number): string {
  if (dispute.legacy) {
    return "This earlier report never held the errand, so deciding it records your decision only. The errand and its credits stay as they are.";
  }
  if (target === "ACCEPTED") {
    const problem = dispute.problem ? failureReasons[dispute.problem] : "reported problem";
    return `Errand #${shortId(errand.orderId)} will be marked as failed (${problem}). ${amount} credits return to the requester.`;
  }
  const back = errand.disputedFromState ? stateNames[errand.disputedFromState].toLowerCase() : "its earlier state";
  return `Errand #${shortId(errand.orderId)} returns to ${back} and its lifecycle continues. Credits stay reserved.`;
}

/**
 * N2F3.3 and N2F3.7: review the dispute, then accept it (the errand fails and credits return to
 * the requester) or reject it (the errand returns to its earlier state). Order applies the errand
 * change and Credit follows the errand; this page never moves credits itself.
 */
function StatusForm({ dispute, errand, settlement, onChanged }: StatusFormProps) {
  const { withCurrentAccess } = useAuth();
  const options = NEXT_STATUSES[dispute.status];
  const draftKey = `admin-dispute-reason:${dispute.disputeId}`;
  const [target, setTarget] = useState<DisputeTarget | undefined>(options[0]);
  const [reason, setReason] = useState(() => readDraft(draftKey, ""));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<{ message: string; refresh: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  if (!target) {
    return <section aria-labelledby="admin-update-status" className="order-panel admin-wide">
      <h2 id="admin-update-status">Update status</h2>
      <p>This dispute is {disputeStatusLabels[dispute.status].toLowerCase()} and cannot change further.</p>
      {disputeOutcome(dispute) ? <p>{disputeOutcome(dispute)}</p> : null}
    </section>;
  }
  const chosen = target;
  const deciding = chosen === "ACCEPTED" || chosen === "REJECTED";
  // The reserved amount is what moves; fall back to the reward if Credit has not answered.
  const amount = settlement?.state === "RESERVED" ? settlement.amount : errand?.reward ?? 0;
  // A decision changes the errand, so it needs the errand held for this very dispute.
  // Legacy disputes never held the errand, so they can be decided whatever its state.
  const held = dispute.legacy || (errand?.state === "DISPUTED" && errand.disputeId === dispute.disputeId);

  function review(event: FormEvent) {
    event.preventDefault();
    if (deciding && !reason.trim()) {
      setError({ message: "Give a reason to accept or reject this dispute. Both participants will see it.", refresh: false });
      return;
    }
    setError(null);
    if (deciding) setConfirming(true);
    else void save();
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await withCurrentAccess((token) => adminService.transition(dispute.disputeId, {
        toStatus: chosen, reason: reason.trim() || null, expectedVersion: dispute.version,
      }, token));
      clearDraft(draftKey);
      onChanged();
    } catch (failure) {
      setConfirming(false);
      setError({ message: adminError(failure), refresh: needsRefresh(failure) });
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="admin-update-status" className="order-panel admin-wide">
    <h2 id="admin-update-status">Update status</h2>
    <p className="order-muted">{deciding
      ? "Accepting fails the errand and returns the reward to the requester. Rejecting returns the errand to where it was. Both participants see your reason."
      : "Start the review before deciding. Once you review it, the reporter can no longer withdraw it."}</p>
    {error ? <div className="admin-panel-error" role="alert">
      <p>{error.message}</p>
      {error.refresh ? <button className="order-button order-secondary" onClick={onChanged} type="button">Refresh dispute</button> : null}
    </div> : null}
    {confirming && errand ? <div aria-labelledby="admin-confirm-decision" className="admin-confirm" role="group">
      <p id="admin-confirm-decision"><strong>Confirm your decision</strong></p>
      <p>Mark this dispute as {disputeStatusLabels[chosen].toLowerCase()}.</p>
      <p>{errandEffect(chosen, dispute, errand, amount)} This cannot be undone.</p>
      <div className="order-actions">
        <button className="order-button" disabled={saving} onClick={() => void save()} type="button">{saving ? "Applying…" : "Confirm and apply"}</button>
        <button className="order-button order-secondary" disabled={saving} onClick={() => setConfirming(false)} type="button">Back</button>
      </div>
    </div> : <form onSubmit={review}>
      <fieldset className="admin-choices">
        <legend>New status</legend>
        {options.map((option) => <label key={option}>
          <input checked={chosen === option} name="status" onChange={() => setTarget(option)} type="radio" value={option} />
          {option === "ACCEPTED" ? "Accept" : option === "REJECTED" ? "Reject" : "Start review"}
        </label>)}
      </fieldset>
      {deciding && !errand ? <p className="order-muted">Errand details are not loaded, so this dispute cannot be decided right now.</p> : null}
      {deciding && errand && !held ? <p className="order-muted">The errand is no longer held for this dispute. Refresh before deciding.</p> : null}
      <label className="order-label">{deciding ? `Reason (required, shown to both participants, up to ${REASON_LIMIT} characters)` : "Note (optional)"}
        <textarea maxLength={REASON_LIMIT} onChange={(event) => { setReason(event.target.value); writeDraft(draftKey, event.target.value); }} rows={3} value={reason} />
      </label>
      <button className="order-button" disabled={saving || (deciding && !held)} type="submit">{saving ? "Saving…" : deciding ? "Review decision" : "Start review"}</button>
    </form>}
  </section>;
}

export function AdminDisputeDetailPage() {
  const { disputeId = "" } = useParams();
  const dispute = useAdminResource((token) => adminService.dispute(disputeId, token), `dispute:${disputeId}`);
  const orderId = dispute.data?.orderId ?? null;
  const order = useAdminResource(orderId ? (token) => adminOrderService.detail(orderId, token) : null, `order:${orderId}`);
  const settlement = useAdminResource(
    orderId ? (token) => adminCreditService.settlement(orderId, token).catch(noReservation) : null,
    `settlement:${orderId}`,
  );
  const data = dispute.data;
  const errand = order.data;
  // A decision can change the errand and its credits, so refresh every panel together.
  const reloadAll = () => {
    dispute.reload();
    order.reload();
    settlement.reload();
  };

  return <WorkspaceShell adminDescription={DESCRIPTION} className="order-shell admin-shell" userDescription={DESCRIPTION}>
    <Link className="order-back" to="/admin/disputes">← Disputes</Link>
    <header className="order-heading">
      <div>
        <h1>Dispute #{shortId(disputeId)}</h1>
        <p>{data ? `About errand #${shortId(data.orderId)}` : "Dispute case"}</p>
      </div>
      {data ? <DisputeBadge status={data.status} /> : null}
    </header>

    <div className="admin-grid">
      <AdminPanel resource={dispute} title="Case">
        {data ? <>
          <p className="order-description">{problemLabel(data)}</p>
          <dl className="order-facts">
            {/* Legacy participant reports kept their original description. */}
            {data.legacy && data.reporterRole && data.description ? <AdminFact label="Earlier description">{data.description}</AdminFact> : null}
            {/* Only administrator records carry private notes and evidence; participants send statements. */}
            {data.reporterRole ? null : <>
              <AdminFact label="Admin notes">{data.description}</AdminFact>
              <AdminFact label="Evidence">{data.evidenceRefs.length
                ? <ul className="admin-evidence">{data.evidenceRefs.map((reference) => <li key={reference}>{reference}</li>)}</ul>
                : "None recorded"}</AdminFact>
            </>}
            <AdminFact label={disputeOrigin(data).verb}>{disputeOrigin(data).who} {shortId(data.createdBy)}</AdminFact>
            <AdminFact label="Raised at">{orderTime(data.createdAt)} SGT</AdminFact>
            {data.resolutionReason ? <AdminFact label={closingReasonLabel(data.status)}>{data.resolutionReason}</AdminFact> : null}
          </dl>
          {disputeOutcome(data) ? <p>{disputeOutcome(data)}</p> : null}
        </> : null}
      </AdminPanel>

      <AdminPanel resource={dispute} title="Details from participants">
        {data ? data.statements.length ? <ol className="order-history">
          {data.statements.map((statement) => <li key={statement.statementId}>
            <strong>{statementAuthors[statement.authorRole]} {shortId(statement.authorId)}</strong>
            <p>{statement.body}</p>
            <time dateTime={statement.createdAt}>{orderTime(statement.createdAt)} SGT</time>
          </li>)}
        </ol> : <p className="order-muted">Neither participant has sent details yet.</p> : null}
      </AdminPanel>

      <AdminPanel resource={dispute} title="Case history">
        {data ? <ol className="order-history">
          {data.history.map((entry) => <li key={entry.sequence}>
            <strong>{entry.fromStatus ? `${disputeStatusLabels[entry.fromStatus]} → ` : ""}{disputeStatusLabels[entry.toStatus]}</strong>
            {entry.reason ? <small>{entry.reason}</small> : null}
            <small>{entry.toStatus === "WITHDRAWN" ? "Reporter" : "Admin"} {shortId(entry.actorId)}</small>
            <time dateTime={entry.occurredAt}>{orderTime(entry.occurredAt)} SGT</time>
          </li>)}
        </ol> : null}
      </AdminPanel>

      <AdminPanel resource={order} title="Errand state">
        {errand ? <>
          <p className="admin-badges"><OrderBadge state={errand.state} />{errand.overdueAt ? <OverdueFlag /> : null}</p>
          <p>{errand.itemDescription}</p>
          {errand.state === "DISPUTED" && data && errand.disputeId === data.disputeId && errand.disputedFromState
            ? <p className="order-muted">Held for this dispute. Rejecting returns it to {stateNames[errand.disputedFromState].toLowerCase()}.</p> : null}
          {errand.failureReason ? <p className="order-muted">Failure reason: {failureReasonLabel(errand.failureReason)}{errand.failureDetails ? `: ${errand.failureDetails}` : ""}</p> : null}
          {errand.decidedByAdministrator ? <p className="order-muted">Failed by an administrator{errand.decisionDisputeId ? ` for dispute #${shortId(errand.decisionDisputeId)}` : ""}.</p> : null}
          <Link to={`/admin/orders/${errand.orderId}`}>View errand and its history</Link>
        </> : null}
      </AdminPanel>

      <AdminPanel resource={settlement} title="Credit settlement">
        <SettlementFacts errandState={errand?.state} settlement={settlement.data} />
      </AdminPanel>

      {data ? <StatusForm
        dispute={data}
        errand={errand}
        key={`${data.disputeId}:${data.version}`}
        onChanged={reloadAll}
        settlement={settlement.data}
      /> : null}
    </div>
  </WorkspaceShell>;
}
