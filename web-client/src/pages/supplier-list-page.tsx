/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-07
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Tool: Claude Code (model: Claude Opus 5.5), date: 2026-11-02
 * Scope: Implemented Supplier browsing/management UI and refined validation, filters and error states.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isApiRequestError } from "../api/client";
import { type Category, type SupplierList, type SupplierListItem, type SupplierQuery, supplierService } from "../api/supplier-service";
import { useAuth } from "../app/use-auth";
import { SupplierShell } from "../components/supplier-shell";
import { SupplierIcon } from "../components/navigation-icons";
import { SupplierStatusActions } from "../components/supplier-status-actions";

const pageSizes = [6, 12, 20, 50];
const statusOptions = [["", "All"], ["ACTIVE", "Active"], ["INACTIVE", "Inactive"]] as const;

function readQuery(params: URLSearchParams, admin: boolean): SupplierQuery {
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("page_size"));
  const status = params.get("status");
  return {
    q: params.get("q") ?? "",
    categories: params.getAll("category"),
    sort: params.get("sort") === "desc" ? "desc" : "asc",
    status: admin && (status === "ACTIVE" || status === "INACTIVE") ? status : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    // A hand-edited size outside the selector would fail API validation on every retry.
    pageSize: pageSizes.includes(pageSize) ? pageSize : 6,
  };
}

function hours(item: SupplierListItem): string {
  return item.opening_time && item.closing_time ? `${item.opening_time}–${item.closing_time}` : "Hours not provided";
}

export function SupplierListPage({ admin = false }: { admin?: boolean }) {
  const { withCurrentAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryKey = searchParams.toString();
  const query = useMemo(() => readQuery(new URLSearchParams(queryKey), admin), [queryKey, admin]);
  const [search, setSearch] = useState(query.q ?? "");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryError, setCategoryError] = useState(false);
  const [categoryReload, setCategoryReload] = useState(0);
  const [result, setResult] = useState<SupplierList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invalidFilters, setInvalidFilters] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const categoryPicker = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    // <details> only closes from its own summary; close it like a menu when the user moves elsewhere.
    function closeOutside(event: Event) {
      const picker = categoryPicker.current;
      if (picker?.open && !picker.contains(event.target as Node)) picker.open = false;
    }
    function closeOnEscape(event: KeyboardEvent) {
      const picker = categoryPicker.current;
      if (event.key !== "Escape" || !picker?.open) return;
      picker.open = false;
      picker.querySelector("summary")?.focus();
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("focusin", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("focusin", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    setSearch(query.q ?? "");
  }, [query.q]);

  useEffect(() => {
    const term = search.trim();
    if (term === (query.q ?? "")) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      next.delete("building_area");
      if (term) next.set("q", term); else next.delete("q");
      next.delete("page");
      setSearchParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query.q, search, setSearchParams]);

  useEffect(() => {
    let active = true;
    withCurrentAccess((token) => supplierService.categories(token))
      .then((items) => { if (active) { setCategories(items); setCategoryError(false); } })
      .catch(() => { if (active) setCategoryError(true); });
    return () => { active = false; };
  }, [withCurrentAccess, categoryReload]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    withCurrentAccess((token) => supplierService.list(query, token, admin))
      .then((data) => {
        if (!active) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.page_size));
        if (data.page > lastPage) {
          const next = new URLSearchParams(queryKey);
          if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
          setSearchParams(next, { replace: true });
          return;
        }
        setResult(data);
      })
      .catch((failure) => {
        if (!active) return;
        setResult(null);
        // A hand-edited or outdated link, such as an unknown category, fails validation on every retry.
        setInvalidFilters(isApiRequestError(failure) && failure.status === 422);
        setError(isApiRequestError(failure) ? failure.message : "We could not load suppliers. Try again.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [admin, query, queryKey, reload, setSearchParams, withCurrentAccess]);

  function updateQuery(changes: Record<string, string | null>, categoryCodes?: string[]) {
    // Read the current URL at action time so consecutive filter changes do not
    // overwrite one another before React has rendered the previous navigation.
    const next = new URLSearchParams(window.location.search);
    next.delete("building_area");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    if (categoryCodes) {
      next.delete("category");
      for (const code of categoryCodes) next.append("category", code);
    }
    if (!("page" in changes)) next.delete("page");
    setSearchParams(next);
  }

  function clearFilters() {
    setSearch("");
    updateQuery({ q: null, status: null }, []);
  }

  function toggleCategory(code: string) {
    const selected = new Set(query.categories);
    if (selected.has(code)) selected.delete(code); else selected.add(code);
    updateQuery({}, [...selected]);
  }

  const selectedCategories = query.categories ?? [];
  const maxPage = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  const from = result && result.total > 0 ? (result.page - 1) * result.page_size + 1 : 0;
  const to = result ? Math.min(result.total, result.page * result.page_size) : 0;
  const names = new Map(categories.map((category) => [category.code, category.display_name]));
  const hasFilters = Boolean(query.q?.trim() || query.categories?.length || query.status);

  return <SupplierShell>
    <div className="supplier-page-heading">
      <div><h1>{admin ? "Manage suppliers" : "Campus suppliers"}</h1><p>{admin ? "Maintain supplier details and availability." : "Browse nearby campus spots and find what you need."}</p></div>
      {admin ? <Link className="supplier-primary-action" to="/admin/suppliers/new">+ Add supplier</Link> : null}
    </div>
    {notice ? <p className="supplier-notice" role="status">{notice}</p> : null}

    <section aria-label="Search and filter suppliers" className="supplier-filter-panel">
      <div className="supplier-search-form" role="search">
        <label className="supplier-search-field"><span className="sr-only">Search suppliers</span><span aria-hidden="true">⌕</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Search names, areas or pickup locations" type="search" value={search} /></label>
      </div>
      <div className="supplier-filter-row">
        <details className="supplier-category-picker" ref={categoryPicker}><summary><span>Categories: {selectedCategories.length ? selectedCategories.map((code) => names.get(code) ?? code).join(", ") : "All"}</span></summary>
          <div className="supplier-category-options">
            {categoryError ? <p>Categories could not load. <button className="supplier-inline-button" onClick={() => setCategoryReload((value) => value + 1)} type="button">Try again</button></p> : null}
            {categories.map((category) => <label key={category.code}><input checked={selectedCategories.includes(category.code)} onChange={() => toggleCategory(category.code)} type="checkbox" />{category.display_name}</label>)}
          </div>
        </details>
        <button aria-label={`Sort: Name ${query.sort === "desc" ? "Z–A" : "A–Z"}. Switch to ${query.sort === "desc" ? "A–Z" : "Z–A"}`} className="supplier-sort-toggle" onClick={() => updateQuery({ sort: query.sort === "desc" ? null : "desc" })} type="button">Sort: Name {query.sort === "desc" ? "Z–A" : "A–Z"}<span aria-hidden="true">⇅</span></button>
        {admin ? <fieldset className="supplier-status-filter"><legend className="sr-only">Supplier status</legend>{statusOptions.map(([value, label]) => <label key={label}><input checked={(query.status ?? "") === value} className="sr-only" name="supplier-status" onChange={() => updateQuery({ status: value || null })} type="radio" />{label}</label>)}</fieldset> : <span className="supplier-active-note">Active suppliers only</span>}
        {hasFilters ? <button className="supplier-inline-button" onClick={clearFilters} type="button">Clear filters</button> : null}
      </div>
    </section>

    {loading ? <p className="supplier-state" role="status">Loading suppliers…</p> : null}
    {error && invalidFilters ? <section className="supplier-state supplier-state-error" role="alert"><h2>These filters cannot be used</h2><p>This link includes a search or filter that is not supported. Clear the filters to see all suppliers.</p><button className="supplier-apply-button" onClick={clearFilters} type="button">Clear filters</button></section> : null}
    {error && !invalidFilters ? <section className="supplier-state supplier-state-error" role="alert"><h2>Suppliers could not load</h2><p>{error}</p><button className="supplier-apply-button" onClick={() => { setReload((value) => value + 1); if (categoryError) setCategoryReload((value) => value + 1); }} type="button">Try again</button></section> : null}
    {!loading && !error && result?.total === 0 ? <section className="supplier-state"><h2>{hasFilters ? "No suppliers found" : admin ? "No suppliers yet" : "No active suppliers yet"}</h2><p>{hasFilters ? "Try another search or use Clear filters above." : admin ? "Add the first campus supplier to get started." : "Check back soon for campus suppliers."}</p>{!hasFilters && admin ? <Link className="supplier-primary-action" to="/admin/suppliers/new">Add supplier</Link> : null}</section> : null}
    {!loading && !error && result && result.total > 0 ? <>
      <div aria-live="polite" className="supplier-results-count">{result.total} supplier{result.total === 1 ? "" : "s"}</div>
      <div className={admin ? "supplier-admin-results" : "supplier-card-grid"}>
        {admin ? <div aria-hidden="true" className="supplier-table-head"><span>Supplier</span><span>Category</span><span>Campus area</span><span>Status</span><span>Actions</span></div> : null}
        {result.items.map((item) => <article className={admin ? "supplier-admin-row" : "supplier-card"} key={item.id}>
          {!admin ? <div aria-hidden="true" className="supplier-card-icon"><SupplierIcon size={22} /></div> : null}
          <div className="supplier-card-main"><h2>{item.name}</h2>{!admin ? <><p>{item.building_area}{item.floor ? ` · Floor ${item.floor}` : ""}</p><p>{item.categories.map((code) => names.get(code) ?? code).join(" / ")}</p><p className="supplier-card-hours">{hours(item)}</p></> : null}</div>
          {admin ? <><div className="supplier-admin-category">{item.categories.map((code) => names.get(code) ?? code).join(" / ")}</div><div className="supplier-admin-area">{item.building_area}{item.floor ? ` · Floor ${item.floor}` : ""}</div><span className={`supplier-status ${item.status.toLowerCase()}`}>{item.status === "ACTIVE" ? "Active" : "Inactive"}</span><div className="supplier-admin-actions"><Link to={`/admin/suppliers/${item.id}`}>View</Link><Link to={`/admin/suppliers/${item.id}/edit`}>Edit</Link><SupplierStatusActions id={item.id} name={item.name} onChanged={(message) => { setNotice(message); setReload((value) => value + 1); }} status={item.status} /></div></> : <><span className="supplier-status active">Active</span><Link aria-label={`View ${item.name}`} className="supplier-card-link" to={`/suppliers/${item.id}`}>View supplier <span aria-hidden="true">→</span></Link></>}
        </article>)}
      </div>
    </> : null}
    {!error && result ? <div className="supplier-pagination">
      <span>Showing {from}–{to} of {result.total}</span>
      <label>Per page <select aria-label="Suppliers per page" disabled={loading} onChange={(event) => updateQuery({ page_size: event.target.value === "6" ? null : event.target.value })} value={String(query.pageSize)}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
      <div className="supplier-page-buttons">
        <button disabled={loading || result.page <= 1} onClick={() => updateQuery({ page: String(result.page - 1) })} type="button">Previous</button>
        <span>Page {result.page} of {maxPage}</span>
        <button disabled={loading || result.page >= maxPage} onClick={() => updateQuery({ page: String(result.page + 1) })} type="button">Next</button>
      </div>
    </div> : null}
  </SupplierShell>;
}
