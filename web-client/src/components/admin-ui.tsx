// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29, 2026-11-08,
// 2026-11-10
// Scope: Implemented shared Admin Dashboard panels, badges, facts and lists; added the pending
// settlement notice and disputed-errand details.
// Author review: I validated correctness and supplied additional boundary checks.

import type { PropsWithChildren, ReactNode } from "react";
import { Link } from "react-router-dom";
import type { DisputeStatus, DisputeSummary } from "../api/admin-service";
import type { Settlement } from "../api/credit-service";
import type { OrderState } from "../api/order-service";
import { adminError, disputeOrigin, disputeStatusLabels, problemLabel, shortId, updatedAt } from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";

type PanelResource = { loading: boolean; error: unknown; retrievedAt: Date | null; reload: () => void };

/**
 * One independently loaded dashboard panel: loading, failure with retry, stale data and the
 * retrieval time are explicit, and no values are shown until data has arrived (N2NFR4.4, N2NFR5.2).
 */
export function AdminPanel({ title, resource, wide = false, intro, children }: PropsWithChildren<{
  title: string; resource: PanelResource; wide?: boolean; intro?: ReactNode;
}>) {
  const headingId = `admin-panel-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return <section aria-labelledby={headingId} className={`order-panel admin-panel${wide ? " admin-wide" : ""}`}>
    <div className="admin-panel-heading">
      <h2 id={headingId}>{title}</h2>
      {resource.retrievedAt ? <span className="admin-updated">{updatedAt(resource.retrievedAt)}</span> : null}
    </div>
    {intro}
    {resource.error ? <div className="admin-panel-error" role="alert">
      <p>{resource.retrievedAt ? `Showing earlier data. ${adminError(resource.error)}` : adminError(resource.error)}</p>
      <button className="order-button order-secondary" onClick={resource.reload} type="button">Try again</button>
    </div> : null}
    {resource.loading && !resource.retrievedAt ? <p aria-live="polite" className="order-muted">Loading…</p> : null}
    {resource.retrievedAt ? children : null}
  </section>;
}

export function DisputeBadge({ status }: { status: DisputeStatus }) {
  return <span className={`order-badge dispute-badge-${status.toLowerCase()}`}>{disputeStatusLabels[status]}</span>;
}

export function OverdueFlag() {
  return <span className="admin-flag">Overdue</span>;
}

export function AdminFact({ label, children }: PropsWithChildren<{ label: string }>) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

const settlementLabels: Record<Settlement["state"], string> = {
  RESERVED: "Reserved until the errand ends",
  RELEASED: "Released back to the requester",
  TRANSFERRED: "Transferred to the courier",
  CLOSED: "Closed without a reservation",
};

// N2F3.4.3: the credit outcome is shown apart from the errand state.
export function SettlementFacts({ settlement, errandState }: { settlement: Settlement | null; errandState?: OrderState }) {
  if (!settlement) return <p className="order-muted">No credit reservation is recorded for this errand.</p>;
  // Credit settles shortly after Order records the outcome, so a reservation may briefly remain.
  const pending = settlement.state === "RESERVED" && (errandState === "FAILED" || errandState === "COMPLETED");
  return <>
    <dl className="order-facts">
      <AdminFact label="Credit state">{settlementLabels[settlement.state]}</AdminFact>
      <AdminFact label="Amount">{settlement.amount} credits</AdminFact>
      <AdminFact label="Last change">{orderTime(settlement.updatedAt)} SGT</AdminFact>
    </dl>
    {pending ? <p role="status">{errandState === "FAILED" ? "Release to the requester is processing." : "Transfer to the courier is processing."} Refresh shortly to see it settled.</p> : null}
    {settlement.state === "RESERVED" && errandState === "DISPUTED" ? <p role="status">The reward stays reserved while the errand is disputed.</p> : null}
    <p className="order-muted">Credits follow the errand: they move only when the errand ends.</p>
  </>;
}

export function DisputeList({ items }: { items: DisputeSummary[] }) {
  return <ul className="admin-list">
    {items.map((dispute) => <li key={dispute.disputeId}>
      <Link className="admin-list-item" to={`/admin/disputes/${dispute.disputeId}`}>
        <span className="admin-row-title"><strong className="admin-clamp">{problemLabel(dispute)}</strong><DisputeBadge status={dispute.status} /></span>
        <span className="admin-row-meta">
          <span>Dispute #{shortId(dispute.disputeId)}</span>
          <span>Errand #{shortId(dispute.orderId)}</span>
          <span>{disputeOrigin(dispute).verb} {disputeOrigin(dispute).who.toLowerCase()}</span>
          <span>{orderTime(dispute.createdAt)} SGT</span>
        </span>
      </Link>
    </li>)}
  </ul>;
}
