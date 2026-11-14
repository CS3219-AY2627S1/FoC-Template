/*
 * AI Assistance Disclosure:
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component RequestBoard.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-16
 * Scope: Replaced demo request data with the order-service GET /orders response and added loading
 *        and error states. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration (#11, #59) - the board queries open errands with the
 *        service's filters (location id, minCredits, expiresBefore) and sorts, pages with
 *        nextCursor ("Load more"), and updates live from the listing feed (created / accepted /
 *        cancelled / expired / edited), refetching after a reconnect. "Near me" became a
 *        delivery-location picker because orders now carry location ids. Text search stays
 *        in the browser over the loaded errands.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: Reads isLoggedIn/sessionReady from the new AuthContext instead of DemoContext, per
 *        instructions.md Stage 16b. /requests stays a public, soft-gated page (its own
 *        ApiNotice prompt), not wrapped in RequireAuth.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Per instructions.md Stage 22: /requests is now wrapped in RequireAuth + ViewGate
 *        (App.jsx, courier-only), so this page no longer renders while logged out. Its empty
 *        state (no open errands, or none matching the search) is now one fixed "No errands
 *        available" / "Check back in a bit." message with no "Post an errand" button, per the
 *        stage's "Find errands empty state" row (posting is now requester-only, so the CTA no
 *        longer belongs on this courier-only page).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 * Scope (2026-11-10, Codex, model: GPT-6): Fixed clipped searchable filter menus by allowing the filter row to wrap.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 */

import SearchableSelect from '../components/SearchableSelect'
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import RequestCard from "../components/RequestCard";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import { useApiNotice } from "../components/ApiNotice";
import { useAuth } from "../context/AuthContext";
import { listOrders } from "../api/orders";
import { useLocationNames } from "../api/lookups";
import { useReferenceData } from "../api/useApi";
import {
  subscribeListing,
  useOrderEvents,
  useSocketReady,
} from "../realtime/orderSocket";

const FILTERS = ["All", "3+ credits", "Expiring soon"];
const EXPIRING_SOON_MIN = 45;
const SORTS = [
  { key: "deadline", label: "Deliver-by, soonest", sort: "completeBy", order: "asc" },
  { key: "credits", label: "Most credits", sort: "credits", order: "desc" },
  { key: "newest", label: "Newest", sort: "createdAt", order: "desc" },
];

// Same order as the service: nulls last ascending / first descending, then id ascending.
function compareBy(field, order) {
  const dir = order === "asc" ? 1 : -1;
  const value = (o) =>
    field === "credits" ? o.credits : o[field] ? Date.parse(o[field]) : null;
  return (a, b) => {
    const x = value(a);
    const y = value(b);
    if (x !== y) {
      if (x === null) return dir; // asc: null after; desc: null before
      if (y === null) return -dir;
      return (x - y) * dir;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

// Whether a pushed card belongs on the board under the current query.
function matches(order, query) {
  if (order.status !== "open") return false;
  if (query.location && Number(order.deliveryLocationId) !== Number(query.location))
    return false;
  if (query.minCredits !== undefined && order.credits < query.minCredits) return false;
  if (
    query.expiresBefore &&
    !(order.completeBy && Date.parse(order.completeBy) < Date.parse(query.expiresBefore))
  )
    return false;
  return true;
}

// Order F2.1 listing, F2.1.1 detail, F3.1 acceptance, F3.2 validation, F3.5.1/F3.5.2 updates.
export default function RequestBoard() {
  const { isLoggedIn, sessionReady } = useAuth();
  const [filter, setFilter] = useState("All");
  const [locationId, setLocationId] = useState("");
  const [sortKey, setSortKey] = useState("deadline");
  const [search, setSearch] = useState("");
  const [state, setState] = useState({
    orders: [],
    nextCursor: null,
    loading: true,
    loadingMore: false,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const requestSeq = useRef(0);
  const { locations } = useReferenceData();
  const locationName = useLocationNames();

  const sort = SORTS.find((s) => s.key === sortKey);
  // "Expiring soon" is anchored when chosen (or reloaded), not on every render.
  const query = useMemo(() => {
    const q = { status: "open", sort: sort.sort, order: sort.order };
    if (locationId) q.location = locationId;
    if (filter === "3+ credits") q.minCredits = 3;
    if (filter === "Expiring soon")
      q.expiresBefore = new Date(
        Date.now() + EXPIRING_SOON_MIN * 60000,
      ).toISOString();
    return q;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, locationId, sort, nonce]);

  useEffect(() => {
    if (!sessionReady || !isLoggedIn) return undefined;
    const seq = ++requestSeq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    listOrders(query).then(
      ({ orders, nextCursor }) =>
        seq === requestSeq.current &&
        setState({ orders, nextCursor, loading: false, loadingMore: false, error: null }),
      (error) =>
        seq === requestSeq.current &&
        setState((s) => ({ ...s, orders: [], nextCursor: null, loading: false, error })),
    );
    return undefined;
  }, [query, isLoggedIn, sessionReady]);

  const loadMore = () => {
    const seq = requestSeq.current;
    setState((s) => ({ ...s, loadingMore: true }));
    listOrders({ ...query, cursor: state.nextCursor }).then(
      ({ orders, nextCursor }) =>
        seq === requestSeq.current &&
        setState((s) => {
          const have = new Set(s.orders.map((o) => o.id));
          return {
            ...s,
            orders: [...s.orders, ...orders.filter((o) => !have.has(o.id))],
            nextCursor,
            loadingMore: false,
          };
        }),
      (error) =>
        seq === requestSeq.current &&
        setState((s) => ({ ...s, loadingMore: false, error })),
    );
  };

  // F3.5.2: live board. Events are thin; a stale one (version not newer) is ignored.
  useEffect(() => (isLoggedIn ? subscribeListing() : undefined), [isLoggedIn]);
  useSocketReady(reload); // anything pushed while disconnected is not replayed
  const editTimer = useRef(null);
  useEffect(() => () => clearTimeout(editTimer.current), []);
  useOrderEvents((name, p) => {
    if (name === "order:created" && p.order) {
      const card = { ...p.order, status: p.status, version: p.version, courierId: null };
      if (!matches(card, query)) return;
      setState((s) =>
        s.orders.some((o) => o.id === card.id)
          ? s
          : { ...s, orders: [...s.orders, card].sort(compareBy(query.sort, query.order)) },
      );
    } else if (name === "order:accepted") {
      setState((s) => ({
        ...s,
        orders: s.orders.map((o) =>
          o.id === p.orderId && p.version > (o.version ?? 0)
            ? { ...o, status: p.status, version: p.version }
            : o,
        ),
      }));
    } else if (name === "order:cancelled" || name === "order:expired") {
      setState((s) => ({ ...s, orders: s.orders.filter((o) => o.id !== p.orderId) }));
    } else if (name === "order:edited") {
      // The edit event carries no fields: refetch once a burst settles.
      if (state.orders.some((o) => o.id === p.orderId)) {
        clearTimeout(editTimer.current);
        editTimer.current = setTimeout(reload, 300);
      }
    }
  });

  const onAccepted = (order) =>
    setState((s) => ({
      ...s,
      orders: s.orders.map((o) => (o.id === order.id ? { ...o, ...order } : o)),
    }));

  const notice = useApiNotice(
    { loading: state.loading && state.orders.length === 0, error: state.error },
    "errands",
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.orders;
    return state.orders.filter((r) =>
      [r.description, locationName(r.deliveryLocationId), r.additionalDetails]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [state.orders, search, locationName]);

  const openCount = state.orders.filter((r) => r.status === "open").length;

  const select =
    "h-11 md:h-10 rounded-pill border border-line bg-surface px-3 text-sm text-ink-70";

  return (
    <div className="page-width page-gutter py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">
        Find errands
      </h1>
      <p className="mt-1.5 text-base text-ink-70">
        <span className="tnum">{openCount}</span> open
        {state.nextCursor ? "+" : ""}
      </p>

      {notice}

      <div className="relative mt-5">
        <Search
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-40"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search what's wanted or the drop-off point"
          aria-label="Search loaded errands"
          className="h-12 w-full rounded-btn border border-line bg-surface pl-11 pr-4 text-base text-ink"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={
              "h-11 md:h-10 shrink-0 rounded-pill border px-4 text-sm font-medium transition-colors duration-150 " +
              (filter === f
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-ink-70 hover:border-ink hover:text-ink")
            }
          >
            {f}
          </button>
        ))}
        <SearchableSelect
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
          aria-label="Drop-off point"
          className={select + " shrink-0"}
        >
          <option value="">Any drop-off point</option>
          {locations.map((l) => (
            <option key={l.location_id} value={l.location_id}>
              {l.location}
            </option>
          ))}
        </SearchableSelect>
        <SearchableSelect
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value)}
          aria-label="Sort errands"
          className={select + " shrink-0"}
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </SearchableSelect>
      </div>

      {/* F3.5.2 — the board updates live over the order-service socket. */}
      <div className="mt-6">
        <div className="h-px w-full bg-blue" aria-hidden="true" />
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-40">
          <span
            className="foc-pulse inline-block h-1.5 w-1.5 rounded-pill bg-blue"
            aria-hidden="true"
          />
          Updating live
        </p>
      </div>

      {!notice && (
        <div className="mt-4 space-y-3">
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              locationName={locationName(r.deliveryLocationId)}
              onAccepted={onAccepted}
            />
          ))}
        </div>
      )}

      {!notice && state.nextCursor && (
        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={state.loadingMore}
            onClick={loadMore}
          >
            {state.loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {!notice && shown.length === 0 && (
        <div className="mt-4">
          <EmptyState title="No errands available" body="Check back in a bit." />
        </div>
      )}
    </div>
  );
}
