// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-09, 2026-10-10
// Scope: Implemented the searchable supplier selector used by Order creation.
// Author review: I validated correctness and added boundary checks where needed.

import { useEffect, useId, useState } from "react";
import { supplierService, type SupplierListItem } from "../api/supplier-service";
import { useAuth } from "../app/use-auth";
import { orderError } from "../app/order-presentation";

const supplierLabel = (supplier: SupplierListItem) => `${supplier.name} · ${supplier.building_area}`;

export function OrderSupplierPicker({ value, onChange, disabled = false, required = false }: {
  value: string; onChange: (id: string) => void; disabled?: boolean; required?: boolean;
}) {
  const { withCurrentAccess } = useAuth();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SupplierListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(-1);
  const expanded = open && !disabled;
  const selectedLabel = value ? labels[value] ?? "Selected supplier" : "";
  const options = [
    ...(!required ? [{ id: "", name: "All suppliers", area: "" }] : []),
    ...items.map((item) => ({ id: item.id, name: item.name, area: item.building_area })),
  ];
  const more = items.length < total;

  // Restored drafts and URL filters may refer to an item not loaded in this page.
  useEffect(() => {
    if (!value || labels[value]) return;
    let active = true;
    withCurrentAccess((token) => supplierService.detail(value, token))
      .then((supplier) => { if (active) setLabels((current) => ({ ...current, [value]: supplierLabel(supplier) })); })
      .catch(() => { /* Keep the saved ID; Order still validates it on submission. */ });
    return () => { active = false; };
  }, [labels, value, withCurrentAccess]);

  useEffect(() => {
    if (!expanded) return;
    let active = true;
    const timer = window.setTimeout(() => {
      withCurrentAccess((token) => supplierService.list({ q: search, page, pageSize: 20 }, token))
        .then((data) => {
          if (!active) return;
          setItems((current) => page === 1 ? data.items : [...current, ...data.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
          setTotal(data.total);
          setLabels((current) => ({ ...current, ...Object.fromEntries(data.items.map((item) => [item.id, supplierLabel(item)])) }));
          setError(null);
        })
        .catch((failure) => { if (active) setError(orderError(failure)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [expanded, page, reload, search, withCurrentAccess]);

  useEffect(() => {
    if (expanded && activeIndex >= 0) document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, expanded, id]);

  function resetSearch(query: string) {
    setSearch(query); setPage(1); setItems([]); setTotal(0);
    setLoading(true); setError(null); setActiveIndex(-1);
    setReload((current) => current + 1);
  }
  function showOptions() {
    if (expanded || disabled) return;
    setDraft(selectedLabel); resetSearch(""); setOpen(true);
  }
  function choose(supplierId: string) {
    onChange(supplierId); setOpen(false); setActiveIndex(-1);
  }
  function loadMore() {
    if (!more || loading || error) return;
    setLoading(true); setPage((current) => current + 1);
  }

  return <div className="order-supplier-picker" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActiveIndex(-1); }
  }}>
    <label className="order-label" htmlFor={id}>{required ? "Pickup supplier" : "Filter by supplier"}</label>
    <div className="order-combobox-control">
      <input id={id} role="combobox" autoComplete="off"
        aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        aria-required={required} disabled={disabled} value={expanded ? draft : selectedLabel}
        placeholder={required ? "Search or select a supplier" : "All suppliers"}
        onFocus={(event) => { showOptions(); event.currentTarget.select(); }}
        onClick={showOptions}
        onChange={(event) => {
          setDraft(event.target.value); resetSearch(event.target.value); setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActiveIndex(-1); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!expanded) { showOptions(); return; }
            if (event.key === "ArrowDown" && activeIndex === options.length - 1) loadMore();
            setActiveIndex((current) => options.length ? Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))) : -1);
          }
          if (event.key === "Enter" && expanded) {
            event.preventDefault();
            if (activeIndex >= 0 && options[activeIndex]) choose(options[activeIndex].id);
          }
        }}
      />
      <span className="order-combobox-arrow" aria-hidden="true">⌄</span>
    </div>
    {expanded ? <div className="order-combobox-popup">
      <ul id={`${id}-list`} role="listbox" aria-label="Suppliers" aria-busy={loading}
        onScroll={(event) => {
          const list = event.currentTarget;
          if (list.scrollHeight - list.scrollTop - list.clientHeight < 40) loadMore();
        }}>
        {options.map((option, index) => <li key={option.id} id={`${id}-option-${index}`} role="option"
          aria-selected={value === option.id} className={activeIndex === index ? "order-combobox-active" : undefined}
          onPointerDown={(event) => event.preventDefault()} onClick={() => choose(option.id)}>
          <span>{option.name}</span>{option.area ? <small>{option.area}</small> : null}
        </li>)}
      </ul>
      {loading ? <p role="status">Loading suppliers…</p> : null}
      {error ? <p role="alert">{error} <button type="button" className="order-text-button" onClick={() => { setLoading(true); setError(null); setReload((current) => current + 1); }}>Retry suppliers</button></p> : null}
      {!loading && !error && !items.length ? <p role="status">No active suppliers match this search.</p> : null}
      {!loading && !error && more ? <button type="button" className="order-text-button order-combobox-more" onClick={loadMore}>Load more results</button> : null}
    </div> : null}
  </div>;
}
