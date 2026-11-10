// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented Order browsing, filters and result/error display.
// Author review: I validated correctness and added boundary checks where needed.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { orderService, type OrderAssessment, type OrderPage } from "../api/order-service";
import { useAuth } from "../app/use-auth";
import { OrderSupplierPicker } from "../components/order-supplier-picker";
import { OrderCard, OrderFailure, OrderPagination, OrderShell } from "../components/order-ui";
import { orderError } from "../app/order-presentation";

export function OrderListPage({ mine = false }: { mine?: boolean }) {
  const { withCurrentAccess } = useAuth();
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page") ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 && rawPage <= 1_000_000 ? rawPage : 1;
  const relationship = params.get("relationship") === "courier" ? "courier" : "requester";
  const supplierId = params.get("supplierId") ?? "";
  const queryKey = params.toString();
  const [result, setResult] = useState<OrderPage<OrderAssessment> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setResult(null);
    setError(null);
    withCurrentAccess((token) => mine
      ? orderService.mine(relationship, { page, pageSize: 12 }, token)
      : orderService.list({ page, pageSize: 12, supplierId: supplierId || undefined }, token))
      .then((data) => {
        if (!active) return;
        const last = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (data.page > last) {
          const next = new URLSearchParams(queryKey);
          next.set("page", String(last));
          setParams(next, { replace: true });
        } else setResult(data);
      })
      .catch((failure) => { if (active) setError(orderError(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mine, page, queryKey, relationship, reload, setParams, supplierId, withCurrentAccess]);
  function query(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }
  return <OrderShell>
    <div className="order-heading"><div><h1>{mine ? "My errands" : "Open errands"}</h1><p>{mine ? "Keep track of errands you requested or are helping with." : "Browse campus requests and find out what needs picking up."}</p></div><Link className="order-button" to="/orders/new">+ Create an errand</Link></div>
    {mine ? <div className="order-tabs" aria-label="Your relationship to an errand"><button aria-pressed={relationship === "requester"} onClick={() => query("relationship", "requester")} type="button">As requester</button><button aria-pressed={relationship === "courier"} onClick={() => query("relationship", "courier")} type="button">As courier</button></div>
      : <details className="order-panel order-filter"><summary>Supplier filter{supplierId ? " · Selected" : " · All suppliers"}</summary><OrderSupplierPicker value={supplierId} onChange={(id) => query("supplierId", id)} /></details>}
    <div className="order-list-toolbar"><span className="order-muted">Newest first · Times in Singapore time</span><button className="order-text-button" disabled={loading} onClick={() => setReload((n) => n + 1)} type="button">Refresh errands</button></div>
    {loading ? <p className="order-panel" role="status">Loading errands…</p> : null}
    {error ? <OrderFailure message={error} retry={() => setReload((n) => n + 1)} /> : null}
    {!loading && !error && result ? <>
      {result.items.length ? <div className="order-card-grid">{result.items.map((order) => <OrderCard key={order.orderId} order={order} />)}</div> : <section className="order-panel order-empty"><h2>{mine ? "No errands here yet" : "No open errands found"}</h2><p>{mine ? relationship === "requester" ? "Errands you post will appear here." : "Errands you accept will appear here." : "Try another supplier or check again later."}</p><Link to="/orders/new">Create an errand</Link></section>}
      <OrderPagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={(next) => query("page", String(next))} />
    </> : null}
  </OrderShell>;
}
