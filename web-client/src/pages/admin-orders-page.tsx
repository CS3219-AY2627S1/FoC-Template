// AI Assistance Disclosure:
// Tool: Claude Code (model: Claude Opus 5.5), date: 2026-10-28, 2026-11-10
// Scope: Implemented the admin errand list with views and filters; added the disputed view.
// Author review: I validated correctness and supplied additional boundary checks.

import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { adminOrderService, type AdminOrderQuery } from "../api/order-service";
import { LIVE_STATES, PAST_STATES, shortId } from "../app/admin-presentation";
import { orderTime } from "../app/order-presentation";
import { useAdminResource } from "../app/use-admin-resource";
import { AdminPanel, OverdueFlag } from "../components/admin-ui";
import { OrderBadge, OrderPagination } from "../components/order-ui";
import { OrderSupplierPicker } from "../components/order-supplier-picker";
import { WorkspaceShell } from "../components/workspace-shell";

const DESCRIPTION = "Oversee errands, disputes and platform analytics.";
const PAGE_SIZE = 20;
const FILTERS = ["orderId", "participantId", "supplierId", "createdFrom", "createdTo"] as const;
type Filter = typeof FILTERS[number];
type View = "live" | "past" | "disputed" | "failed" | "overdue";

const VIEWS: Record<View, { label: string; query: Pick<AdminOrderQuery, "state" | "overdue"> }> = {
  live: { label: "Live", query: { state: LIVE_STATES } },
  past: { label: "Past", query: { state: PAST_STATES } },
  disputed: { label: "Disputed", query: { state: ["DISPUTED"] } },
  failed: { label: "Failed", query: { state: ["FAILED"] } },
  overdue: { label: "Overdue", query: { overdue: true } },
};

const emptyFilters = () => Object.fromEntries(FILTERS.map((key) => [key, ""])) as Record<Filter, string>;

export function AdminOrdersPage() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const view: View = requestedView && requestedView in VIEWS ? requestedView as View : "live";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const filters = { ...emptyFilters(), ...Object.fromEntries(FILTERS.map((key) => [key, params.get(key) ?? ""])) };
  const [draft, setDraft] = useState(filters);

  const query: AdminOrderQuery = { ...VIEWS[view].query, page, pageSize: PAGE_SIZE };
  for (const key of FILTERS) if (filters[key]) query[key] = filters[key];
  const orders = useAdminResource((token) => adminOrderService.list(query, token), params.toString());

  function show(next: Record<string, string>) {
    const merged: Record<string, string> = { view, ...filters, ...next };
    setParams(Object.fromEntries(Object.entries(merged).filter(([, value]) => value)));
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    show({ ...Object.fromEntries(FILTERS.map((key) => [key, draft[key].trim()])), page: "" });
  }

  function clearFilters() {
    setDraft(emptyFilters());
    setParams({ view });
  }

  const results = orders.data;
  return <WorkspaceShell adminDescription={DESCRIPTION} className="order-shell admin-shell" userDescription={DESCRIPTION}>
    <header className="order-heading"><div>
      <h1>Errands</h1>
      <p>Every live and past errand on the platform, newest first.</p>
    </div></header>

    <div aria-label="Errand view" className="order-tabs" role="group">
      {(Object.keys(VIEWS) as View[]).map((key) => <button aria-pressed={view === key} key={key} onClick={() => show({ view: key, page: "" })} type="button">{VIEWS[key].label}</button>)}
    </div>

    <form aria-label="Filter errands" className="order-panel admin-filters" onSubmit={applyFilters}>
      <label className="order-label">Errand ID<input onChange={(event) => setDraft({ ...draft, orderId: event.target.value })} value={draft.orderId} /></label>
      <label className="order-label">Requester or courier ID<input onChange={(event) => setDraft({ ...draft, participantId: event.target.value })} value={draft.participantId} /></label>
      <label className="order-label">Created from<input onChange={(event) => setDraft({ ...draft, createdFrom: event.target.value })} type="date" value={draft.createdFrom} /></label>
      <label className="order-label">Created to<input onChange={(event) => setDraft({ ...draft, createdTo: event.target.value })} type="date" value={draft.createdTo} /></label>
      <OrderSupplierPicker onChange={(supplierId) => setDraft({ ...draft, supplierId })} value={draft.supplierId} />
      <div className="order-actions">
        <button className="order-button" type="submit">Apply filters</button>
        <button className="order-button order-secondary" onClick={clearFilters} type="button">Clear</button>
      </div>
    </form>

    <AdminPanel resource={orders} title="Results" wide>
      {results ? results.items.length === 0
        ? <p className="order-empty">No errands match this view and these filters.</p>
        : <>
          <ul className="admin-list">
            {results.items.map((order) => <li key={order.orderId}>
              <Link className="admin-list-item" to={`/admin/orders/${order.orderId}`}>
                <span className="admin-row-title">
                  <strong className="admin-clamp">{order.itemDescription}</strong>
                  <span className="admin-badges"><OrderBadge state={order.state} />{order.overdueAt ? <OverdueFlag /> : null}</span>
                </span>
                <span className="admin-row-meta">
                  <span>Errand #{shortId(order.orderId)}</span>
                  <span>{order.pickup.name}</span>
                  <span>{order.reward} credits</span>
                  <span>Requester {shortId(order.requesterId)}</span>
                  <span>Courier {shortId(order.courierId)}</span>
                  <span>Created {orderTime(order.createdAt)} SGT</span>
                </span>
              </Link>
            </li>)}
          </ul>
          <OrderPagination loading={orders.loading} onPage={(next) => show({ page: String(next) })} page={page} pageSize={results.pageSize} total={results.total} />
        </> : null}
    </AdminPanel>
  </WorkspaceShell>;
}
