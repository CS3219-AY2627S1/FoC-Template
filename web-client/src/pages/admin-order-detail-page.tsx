// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-11-08, 2026-11-10
// Scope: Implemented the admin errand detail page with history, settlement and dispute
// recording; added administrator decision history and disputes that hold the errand.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { adminService, type Dispute } from "../api/admin-service";
import { adminCreditService } from "../api/credit-service";
import { adminOrderService, failureReasonLabel, failureReasons, type FailureReason, type OrderParticipant } from "../api/order-service";
import { adminError, clearDraft, noReservation, readDraft, shortId, stateLabel, writeDraft } from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";
import { useAdminResource } from "../app/use-admin-resource";
import { useAuth } from "../app/use-auth";
import { AdminFact, AdminPanel, DisputeList, OverdueFlag, SettlementFacts } from "../components/admin-ui";
import { OrderBadge, OrderSummary } from "../components/order-ui";
import { WorkspaceShell } from "../components/workspace-shell";

const DESCRIPTION = "Oversee errands, disputes and platform analytics.";
const TIMESTAMPS: [keyof OrderParticipant, string][] = [
  ["createdAt", "Created"],
  ["acceptedAt", "Accepted"],
  ["pickedUpAt", "Picked up"],
  ["deliveredAt", "Delivered"],
  ["completedAt", "Completed"],
  ["cancelledAt", "Cancelled"],
  ["expiredAt", "Expired"],
  ["disputedAt", "Disputed"],
  ["failedAt", "Failed"],
  ["overdueAt", "Overdue since"],
];
// Order holds an errand in DISPUTED only from these states.
const DISPUTABLE = ["ACCEPTED", "PICKED_UP", "DELIVERED"];

type DisputeDraft = { problem: FailureReason | ""; details: string; description: string; evidence: string };

function DisputeForm({ orderId, onCreated }: { orderId: string; onCreated: (dispute: Dispute) => void }) {
  const { withCurrentAccess } = useAuth();
  const draftKey = `admin-dispute-draft:${orderId}`;
  const [draft, setDraft] = useState<DisputeDraft>(() => readDraft(draftKey, { problem: "", details: "", description: "", evidence: "" }));
  // One key per dispute: retrying after an ambiguous failure returns the original (N2NFR3.3).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = draft.problem !== "" && (draft.problem !== "OTHER" || draft.details.trim() !== "") && draft.description.trim() !== "";

  function update(next: DisputeDraft) {
    setDraft(next);
    writeDraft(draftKey, next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || draft.problem === "") return;
    const problem = draft.problem;
    setSaving(true);
    setError(null);
    try {
      const evidenceRefs = draft.evidence.split("\n").map((line) => line.trim()).filter(Boolean);
      const dispute = await withCurrentAccess((token) => adminService.createDispute(
        { orderId, problem, problemDetails: draft.details.trim() || null, description: draft.description.trim(), evidenceRefs },
        idempotencyKey, token,
      ));
      clearDraft(draftKey);
      setIdempotencyKey(crypto.randomUUID());
      onCreated(dispute);
    } catch (failure) {
      setError(adminError(failure));
    } finally {
      setSaving(false);
    }
  }

  return <section aria-labelledby="admin-record-dispute" className="order-panel admin-wide">
    <h2 id="admin-record-dispute">Record a dispute</h2>
    <p className="order-muted">Recording a dispute puts the errand on hold until you accept or reject it. Both participants see the problem you select and can send you details; your notes and evidence stay private.</p>
    {error ? <p className="admin-form-error" role="alert">{error}</p> : null}
    <form onSubmit={submit}>
      <label className="order-label">Problem
        <select onChange={(event) => update({ ...draft, problem: event.target.value as DisputeDraft["problem"] })} required value={draft.problem}>
          <option value="">Select a problem</option>
          {Object.entries(failureReasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {draft.problem === "OTHER" ? <label className="order-label">Describe the problem (shown to both participants)<textarea maxLength={500} onChange={(event) => update({ ...draft, details: event.target.value })} required rows={2} value={draft.details} /></label> : null}
      <label className="order-label">Admin notes (private)<textarea maxLength={2000} onChange={(event) => update({ ...draft, description: event.target.value })} required rows={4} value={draft.description} /></label>
      <label className="order-label">Evidence references (optional, one per line)<textarea onChange={(event) => update({ ...draft, evidence: event.target.value })} rows={3} value={draft.evidence} /></label>
      <button className="order-button" disabled={saving || !ready} type="submit">{saving ? "Saving…" : "Record dispute"}</button>
    </form>
  </section>;
}

export function AdminOrderDetailPage() {
  const { orderId = "" } = useParams();
  const navigate = useNavigate();
  const order = useAdminResource((token) => adminOrderService.detail(orderId, token), `order:${orderId}`);
  const history = useAdminResource((token) => adminOrderService.history(orderId, { page: 1, pageSize: 50 }, token), `history:${orderId}`);
  const settlement = useAdminResource((token) => adminCreditService.settlement(orderId, token).catch(noReservation), `settlement:${orderId}`);
  const disputes = useAdminResource((token) => adminService.disputes({ orderId, pageSize: 50 }, token), `disputes:${orderId}`);
  const errand = order.data;

  return <WorkspaceShell adminDescription={DESCRIPTION} className="order-shell admin-shell" userDescription={DESCRIPTION}>
    <Link className="order-back" to="/admin/orders">← Errands</Link>
    <header className="order-heading">
      <div>
        <h1>{errand?.itemDescription ?? "Errand"}</h1>
        <p>Errand #{shortId(orderId)} · read-only administrator view</p>
      </div>
      {errand ? <span className="admin-badges"><OrderBadge state={errand.state} />{errand.overdueAt ? <OverdueFlag /> : null}</span> : null}
    </header>

    <div className="admin-grid">
      <AdminPanel resource={order} title="Errand details">
        {errand ? <>
          <OrderSummary order={errand} />
          <dl className="order-facts">
            <AdminFact label="Errand ID"><span className="order-id">{errand.orderId}</span></AdminFact>
            <AdminFact label="Requester ID"><span className="order-id">{errand.requesterId}</span></AdminFact>
            <AdminFact label="Courier ID"><span className="order-id">{errand.courierId ?? "Not assigned"}</span></AdminFact>
            {TIMESTAMPS.filter(([key]) => errand[key]).map(([key, label]) => <AdminFact key={key} label={label}>{orderTime(String(errand[key]))} SGT</AdminFact>)}
            {errand.failureReason ? <AdminFact label="Failure reason">{failureReasonLabel(errand.failureReason)}{errand.failureDetails ? <small>{errand.failureDetails}</small> : null}</AdminFact> : null}
          </dl>
        </> : null}
      </AdminPanel>

      <AdminPanel resource={history} title="State history">
        {history.data ? <ol className="order-history">
          {history.data.items.map((entry) => <li key={entry.sequence}>
            <strong>{entry.previousState ? `${stateLabel(entry.previousState)} → ` : ""}{stateLabel(entry.newState)}</strong>
            <small>{entry.actorType === "SYSTEM" ? "System" : entry.actorType === "ADMIN" ? `Admin ${shortId(entry.actorId)}` : `User ${shortId(entry.actorId)}`}{entry.failureReason ? ` · ${failureReasonLabel(entry.failureReason)}` : ""}</small>
            {entry.disputeId ? <Link to={`/admin/disputes/${entry.disputeId}`}>Dispute #{shortId(entry.disputeId)}</Link> : null}
            <time dateTime={entry.occurredAt}>{orderTime(entry.occurredAt)} SGT</time>
          </li>)}
        </ol> : null}
      </AdminPanel>

      <AdminPanel resource={settlement} title="Credit settlement">
        <SettlementFacts errandState={errand?.state} settlement={settlement.data} />
      </AdminPanel>

      <AdminPanel resource={disputes} title="Disputes about this errand">
        {disputes.data ? disputes.data.items.length === 0
          ? <p className="order-muted">No disputes recorded for this errand.</p>
          : <DisputeList items={disputes.data.items} /> : null}
      </AdminPanel>

      {errand && DISPUTABLE.includes(errand.state) ? <DisputeForm onCreated={(dispute) => navigate(`/admin/disputes/${dispute.disputeId}`)} orderId={errand.orderId} /> : null}
    </div>
  </WorkspaceShell>;
}
