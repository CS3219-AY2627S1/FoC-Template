// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-10-29
// Scope: Implemented the dispute list, filters and activity log page.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminService, type AuditEntry, type DisputeStatus } from "../api/admin-service";
import { auditActionLabels, disputeStatusLabels, shortId } from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";
import { useAdminResource } from "../app/use-admin-resource";
import { AdminPanel, DisputeList } from "../components/admin-ui";
import { OrderPagination } from "../components/order-ui";
import { WorkspaceShell } from "../components/workspace-shell";

const DESCRIPTION = "Oversee errands, disputes and platform analytics.";
const PAGE_SIZE = 20;
const STATUSES = Object.keys(disputeStatusLabels) as DisputeStatus[];

function auditSummary(entry: AuditEntry): string {
  const action = auditActionLabels[entry.action];
  const outcome = entry.outcome === "SUCCESS" ? "succeeded" : `rejected (${entry.errorCode})`;
  return `${action} ${outcome}`;
}

export function AdminDisputesPage() {
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get("status");
  const status = STATUSES.find((value) => value === requestedStatus);
  const orderId = params.get("orderId") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const auditPage = Math.max(1, Number(params.get("auditPage")) || 1);
  const [orderDraft, setOrderDraft] = useState(orderId);

  const disputes = useAdminResource(
    (token) => adminService.disputes({ status, orderId: orderId || undefined, page, pageSize: PAGE_SIZE }, token),
    `disputes:${status}:${orderId}:${page}`,
  );
  const audit = useAdminResource((token) => adminService.auditLog({ page: auditPage, pageSize: PAGE_SIZE }, token), `audit:${auditPage}`);

  function show(next: Record<string, string>) {
    const merged: Record<string, string> = {
      status: status ?? "", orderId, page: page > 1 ? String(page) : "", auditPage: auditPage > 1 ? String(auditPage) : "", ...next,
    };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value)));
  }

  function filterByErrand(event: FormEvent) {
    event.preventDefault();
    show({ orderId: orderDraft.trim(), page: "" });
  }

  return <WorkspaceShell adminDescription={DESCRIPTION} className="order-shell admin-shell" userDescription={DESCRIPTION}>
    <header className="order-heading"><div>
      <h1>Disputes</h1>
      <p>Disputes reported about errands. Decisions are recorded only; they never change errands or credits.</p>
    </div></header>

    <div aria-label="Dispute status" className="order-tabs admin-tabs" role="group">
      <button aria-pressed={!status} onClick={() => show({ status: "", page: "" })} type="button">All</button>
      {STATUSES.map((value) => <button aria-pressed={status === value} key={value} onClick={() => show({ status: value, page: "" })} type="button">{disputeStatusLabels[value]}</button>)}
    </div>

    <form aria-label="Filter disputes by errand" className="admin-inline-form" onSubmit={filterByErrand}>
      <label className="order-label">Errand ID<input onChange={(event) => setOrderDraft(event.target.value)} value={orderDraft} /></label>
      <button className="order-button order-secondary" type="submit">Filter</button>
    </form>

    <div className="admin-grid">
      <AdminPanel resource={disputes} title="Dispute cases" wide>
        {disputes.data ? disputes.data.items.length === 0
          ? <p className="order-empty">No disputes match this filter. Record one from an errand's page.</p>
          : <>
            <DisputeList items={disputes.data.items} />
            <OrderPagination loading={disputes.loading} onPage={(next) => show({ page: String(next) })} page={page} pageSize={disputes.data.pageSize} total={disputes.data.total} />
          </> : null}
      </AdminPanel>

      <AdminPanel resource={audit} title="Dashboard activity log" wide>
        {audit.data ? audit.data.items.length === 0
          ? <p className="order-muted">No dashboard actions recorded yet.</p>
          : <>
            <ul className="admin-list">
              {audit.data.items.map((entry) => <li key={entry.auditId}><div className="admin-list-item">
                <strong>{auditSummary(entry)}</strong>
                <span className="admin-row-meta">
                  <span>Admin {shortId(entry.actorId)}</span>
                  {entry.targetType === "DISPUTE"
                    ? <Link to={`/admin/disputes/${entry.targetId}`}>Dispute #{shortId(entry.targetId)}</Link>
                    : <Link to={`/admin/orders/${entry.targetId}`}>Errand #{shortId(entry.targetId)}</Link>}
                  <time dateTime={entry.occurredAt}>{orderTime(entry.occurredAt)} SGT</time>
                </span>
              </div></li>)}
            </ul>
            <OrderPagination loading={audit.loading} onPage={(next) => show({ auditPage: String(next) })} page={auditPage} pageSize={audit.data.pageSize} total={audit.data.total} />
            <p className="order-muted">Activity records cannot be edited or deleted.</p>
          </> : null}
      </AdminPanel>
    </div>
  </WorkspaceShell>;
}
