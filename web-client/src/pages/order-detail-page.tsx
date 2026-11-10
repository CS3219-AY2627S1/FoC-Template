// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented participant Order details and lifecycle action integration.
// Author review: I validated correctness and added boundary checks where needed.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { failureReasonLabel, orderService, type OrderDetail, type OrderHistoryEntry, type OrderPage } from "../api/order-service";
import { useAuth } from "../app/use-auth";
import { OrderBadge, OrderFailure, OrderPagination, OrderShell, OrderSummary } from "../components/order-ui";
import { orderError, orderTime } from "../app/order-presentation";
import { OrderLifecycle } from "../components/order-lifecycle";
import { OrderChatButton } from "../components/order-chat-button";
import { ErrandReportPanel } from "../components/errand-report";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const { withCurrentAccess, user } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [historyRevision, setHistoryRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setOrder(null); setLoading(true); setError(null);
    withCurrentAccess((token) => orderService.detail(orderId, token))
      .then((data) => { if (active) setOrder(data); })
      .catch((failure) => { if (active) setError(isApiRequestError(failure) && failure.status === 404 ? "This errand is unavailable or you do not have access to it." : orderError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [orderId, reload, withCurrentAccess]);
  const participant = order && "requesterId" in order && (order.requesterId === user?.userId || order.courierId === user?.userId);
  const counterpartId = order && "requesterId" in order
    ? order.requesterId === user?.userId ? order.courierId : order.courierId === user?.userId ? order.requesterId : null
    : null;
  return <OrderShell>
    <Link className="order-back" to="/orders">← Open errands</Link>
    {loading ? <p className="order-panel" role="status">Loading errand…</p> : null}
    {error ? <OrderFailure message={error} retry={() => setReload((n) => n + 1)} /> : null}
    {order ? <>
      <div className="order-heading"><div><h1>Errand details</h1></div><OrderBadge state={order.state} /></div>
      <div className="order-detail-grid"><section className="order-panel"><div className="order-detail-heading"><h2 className="order-description">{order.itemDescription}</h2>
        {counterpartId && counterpartId !== user?.userId ? <OrderChatButton key={`${orderId}:${counterpartId}`} recipientUserId={counterpartId} recipientRole={"requesterId" in order && order.requesterId === user?.userId ? "courier" : "requester"} /> : null}
      </div><OrderSummary order={order} /><p className="order-muted">Posted {orderTime(order.createdAt)} SGT</p>{participant ? <p>You are the {"requesterId" in order && order.requesterId === user?.userId ? "requester" : "courier"}.</p> : null}</section>
        <aside><OrderLifecycle key={`${orderId}:${user?.userId}`} order={order} onChanged={(updated) => { setOrder(updated); setHistoryRevision((n) => n + 1); }} onRefresh={() => setReload((n) => n + 1)} />
          {participant ? <OrderHistory key={`${orderId}:${historyRevision}`} orderId={orderId} /> : null}
          {participant && "courierId" in order && order.courierId ? <ErrandReportPanel key={`${orderId}:${user?.userId}`} onErrandChanged={() => setReload((n) => n + 1)} orderId={orderId} state={order.state} /> : null}</aside>
      </div>
    </> : null}
  </OrderShell>;
}

function OrderHistory({ orderId }: { orderId: string }) {
  const { withCurrentAccess } = useAuth();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<OrderPage<OrderHistoryEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setResult(null); setError(null);
    withCurrentAccess((token) => orderService.history(orderId, { page, pageSize: 20 }, token))
      .then((data) => { if (active) setResult(data); })
      .catch((failure) => { if (active) setError(orderError(failure)); });
    return () => { active = false; };
  }, [orderId, page, reload, withCurrentAccess]);
  return <section className="order-panel"><h2>Errand history</h2>
    {error ? <p role="alert">{error} <button className="order-text-button" onClick={() => setReload((n) => n + 1)} type="button">Retry history</button></p> : !result ? <p role="status">Loading history…</p> : <>
      <ol className="order-history">{result.items.map((entry) => <li key={entry.sequence}><OrderBadge state={entry.newState} /><time dateTime={entry.occurredAt}>{orderTime(entry.occurredAt)} SGT</time><small>{entry.actorType === "SYSTEM" ? "Updated automatically" : entry.actorType === "ADMIN" ? "Updated by an administrator" : "Updated by a participant"}</small>{entry.failureReason ? <p>{failureReasonLabel(entry.failureReason)}{entry.failureDetails ? `: ${entry.failureDetails}` : ""}</p> : null}</li>)}</ol>
      {!result.items.length ? <p>No history entries yet.</p> : null}
      {result.total > 20 ? <OrderPagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} /> : null}
    </>}
  </section>;
}
