// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11, 2026-10-16
// Scope: Implemented shared Order display helpers and removed the retired demo banner.
// Author review: I validated correctness and added boundary checks where needed.

import type { PropsWithChildren } from "react";
import { Link } from "react-router-dom";
import { orderTime } from "../app/order-presentation";
import type { OrderAssessment, OrderState } from "../api/order-service";
import { WorkspaceShell } from "./workspace-shell";

export function OrderShell({ children }: PropsWithChildren) {
  return <WorkspaceShell className="order-shell" userDescription="Find what you need—or help someone along your route.">
    {children}</WorkspaceShell>;
}

export function OrderBadge({ state }: { state: OrderState }) {
  return <span className={`order-badge order-badge-${state.toLowerCase()}`}>{state.replaceAll("_", " ")}</span>;
}

export function OrderFailure({ message, retry }: { message: string; retry?: () => void }) {
  return <section className="order-panel order-error" role="alert"><h2>Unable to load errands</h2><p>{message}</p>{retry ? <button className="order-button" onClick={retry} type="button">Try again</button> : null}</section>;
}

export function OrderPagination({ page, pageSize, total, loading = false, onPage }: {
  page: number; pageSize: number; total: number; loading?: boolean; onPage: (page: number) => void;
}) {
  const max = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="Result pages" className="order-pagination"><span>{total ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, total)} of {total}</span><div>
    <button className="order-button order-secondary" disabled={loading || page <= 1} onClick={() => onPage(page - 1)} type="button">Previous</button>
    <span>Page {page} of {max}</span>
    <button className="order-button order-secondary" disabled={loading || page >= max} onClick={() => onPage(page + 1)} type="button">Next</button>
  </div></nav>;
}

export function OrderSummary({ order }: { order: OrderAssessment }) {
  return <dl className="order-facts">
    <div><dt>Pickup</dt><dd>{order.pickup.name} · {order.pickup.buildingArea}{order.pickup.floor ? ` · Floor ${order.pickup.floor}` : ""}<small>{order.pickup.pickupLocationDescription}</small></dd></div>
    <div><dt>Deliver to</dt><dd>{order.deliveryLocation}</dd></div>
    <div><dt>Reward</dt><dd>{order.reward} credits</dd></div>
    <div><dt>Accept by</dt><dd>{orderTime(order.acceptanceDeadline)} SGT</dd></div>
    <div><dt>Deliver by</dt><dd>{orderTime(order.deliveryDeadline)} SGT</dd></div>
  </dl>;
}

export function OrderCard({ order }: { order: OrderAssessment }) {
  return <article className="order-panel order-card">
    <div className="order-card-heading"><h2>{order.itemDescription}</h2><OrderBadge state={order.state} /></div>
    <p>{order.pickup.name} → {order.deliveryLocation}</p>
    <div className="order-card-meta"><strong>{order.reward} credits</strong><span>Accept by {orderTime(order.acceptanceDeadline)} SGT</span></div>
    <Link className="order-card-link" to={`/orders/${order.orderId}`}>View errand <span aria-hidden="true">→</span><span className="sr-only"> {order.itemDescription}</span></Link>
  </article>;
}
