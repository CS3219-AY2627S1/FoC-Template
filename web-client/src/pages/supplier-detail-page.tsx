/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Implemented Supplier browsing/management UI and refined validation, filters and error states.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { type Supplier, supplierService } from "../api/supplier-service";
import { useAuth } from "../app/use-auth";
import { SupplierShell } from "../components/supplier-shell";
import { SupplierStatusActions } from "../components/supplier-status-actions";

function localDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }).format(new Date(value));
}

function readableCategory(code: string): string {
  return code.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function SupplierDetailPage({ admin = false }: { admin?: boolean }) {
  const { supplierId } = useParams();
  const location = useLocation();
  const { withCurrentAccess } = useAuth();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [categoryNames, setCategoryNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);

  useEffect(() => {
    let active = true;
    withCurrentAccess((token) => supplierService.categories(token))
      .then((items) => { if (active) setCategoryNames(Object.fromEntries(items.map((item) => [item.code, item.display_name]))); })
      .catch(() => { /* Supplier details remain usable with readable codes. */ });
    return () => { active = false; };
  }, [withCurrentAccess]);

  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    setLoading(true);
    setError(null);
    withCurrentAccess((token) => supplierService.detail(supplierId, token, admin))
      .then((data) => { if (active) setSupplier(data); })
      .catch((failure) => { if (active) { setSupplier(null); setError({ status: isApiRequestError(failure) ? failure.status : 0, message: isApiRequestError(failure) ? failure.message : "Try again." }); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, supplierId, reload, withCurrentAccess]);

  const listPath = admin ? "/admin/suppliers" : "/suppliers";
  // A malformed ID in the URL fails validation (422); retrying cannot find it either.
  const notFound = error?.status === 404 || error?.status === 422;
  const categorySummary = supplier?.categories.map((code) => categoryNames[code] ?? readableCategory(code)).join(" / ") ?? "";
  return <SupplierShell>
    <Link className="supplier-back-link" to={listPath}>← All suppliers</Link>
    {notice ? <p className="supplier-notice" role="status">{notice}</p> : null}
    {loading ? <p className="supplier-state" role="status">Loading supplier…</p> : null}
    {error ? <section className="supplier-state supplier-state-error" role="alert"><h1>{notFound ? "Supplier not found" : "Supplier could not load"}</h1><p>{notFound ? "This supplier may have been deactivated or is no longer available." : error.message}</p>{!notFound ? <button className="supplier-apply-button" onClick={() => setReload((value) => value + 1)} type="button">Try again</button> : null}</section> : null}
    {!loading && supplier ? <>
      <div className="supplier-page-heading supplier-detail-heading"><div><h1>{supplier.name}</h1><p>{supplier.building_area}{supplier.floor ? ` · Floor ${supplier.floor}` : ""} · {categorySummary}</p></div><span className={`supplier-status ${supplier.status.toLowerCase()}`}>{supplier.status === "ACTIVE" ? "Active" : "Inactive"}</span></div>
      {admin ? <div className="supplier-detail-actions"><Link className="supplier-primary-action" to={`/admin/suppliers/${supplier.id}/edit`}>Edit supplier</Link><SupplierStatusActions id={supplier.id} name={supplier.name} onChanged={(message) => { setNotice(message); setReload((value) => value + 1); }} status={supplier.status} /></div> : null}
      {supplier.image_url ? <div className="supplier-detail-image"><img alt={`${supplier.name} location`} src={supplier.image_url} /></div> : null}
      <div className="supplier-detail-grid">
        <section className="supplier-detail-panel"><h2>Supplier information</h2><dl>
          <div><dt>Categories</dt><dd>{categorySummary}</dd></div>
          <div><dt>Building or campus area</dt><dd>{supplier.building_area}</dd></div>
          <div><dt>Pickup location</dt><dd>{supplier.pickup_location_description}</dd></div>
          <div><dt>Floor</dt><dd>{supplier.floor || "Not provided"}</dd></div>
          <div><dt>Opening and closing times</dt><dd>{supplier.opening_time && supplier.closing_time ? `${supplier.opening_time}–${supplier.closing_time}` : "Not provided"}</dd></div>
          <div><dt>Coordinates</dt><dd>{supplier.latitude !== null && supplier.longitude !== null ? `${supplier.latitude}, ${supplier.longitude}` : "Not provided"}</dd></div>
        </dl></section>
        <aside className="supplier-detail-side"><section className="supplier-detail-panel"><h2>Availability</h2><p>{supplier.status === "ACTIVE" ? "Available for new errands." : "This supplier is inactive and is hidden from normal supplier listings."}</p><p className="supplier-detail-pickup">Pickup: {supplier.pickup_location_description}</p></section><section className="supplier-detail-panel"><h2>Record details</h2><dl><div><dt>Supplier ID</dt><dd className="supplier-id">{supplier.id}</dd></div><div><dt>Created</dt><dd>{localDate(supplier.created_at)}</dd></div><div><dt>Last updated</dt><dd>{localDate(supplier.updated_at)}</dd></div></dl></section></aside>
      </div>
    </> : null}
  </SupplierShell>;
}
