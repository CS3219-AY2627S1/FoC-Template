/*
 * AI Assistance Disclosure:
 * Scope (2026-11-08, Codex, model: GPT-6): Reveal delivery inputs after the previous location prompt is answered.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Updated the previous location prompt wording.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Swapped saved location action icons as requested.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced saved location action labels with icons.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Aligned saved location actions with the prompt heading.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Added dismissal controls to the saved location prompt.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Implemented precise delivery details per the team spec.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:Congchen
 * Tool: Claude Code (model: claude-opus-5), date: 2026-09-08
 * Scope: Generated UI mockup component CreateRequest.jsx from team-authored blueprint.md.
 *        Visual/layout implementation only. No requirements, architecture, or
 *        schema decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: Shows the supplier's faculty where the old location text was shown. No requirements, architecture, schema, or API decisions were made by
 *        the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-09-30
 * Scope: The pick-up supplier picker and the preselected supplier (?supplier=id) load from the Supplier Service. The request itself is still mocked (Order Service not connected). No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Connected the post-errand button to the existing Order Service POST /orders endpoint and
 *        added submission loading and error states. No requirements, architecture, schema, or API
 *        decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Copilot SDK (model: unspecified by runtime), date: 2026-10-20
 * Scope: Reused the create form for editing existing orders and submitted non-credit fields
 *        through the existing order-service edit endpoint.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-20
 * Scope: Order Service frontend integration - Post sends POST /orders (supplier id, delivery
 *        location id from the supplier-service location list, credits, optional complete-by and
 *        details), then shows a spinner until the reservation outcome arrives (order:created /
 *        order:cancelled with its reason over the socket, with a /orders/mine re-check as a
 *        fallback) and opens My activity. The stay-open and scheduled-posting fields stay hidden
 *        (George, 2026-10-20) and their unused state is removed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Carried over Wen Xi's edit page (merged in PR #115) onto this form, per
 *        George: /requests/:id/edit loads the errand from GET /orders/mine, mounts the form with
 *        its fields, hides the offer, and saves with PATCH /orders/:id/edit (delivery location
 *        id, complete-by or null, details or null).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Rebased onto PR #115. George chose to keep this implementation, so the
 *        version of this file described in Wen Xi's entries above was replaced.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): `failed` status - the reservation outcome is order:created or
 *        order:failed (with its reason); the re-check treats an order missing from
 *        /orders/mine as failed, since that list leaves failed orders out.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Scope (2026-10-20): Login prompt waits for the session restore (sessionReady), as
 *        Wallet.jsx does, so a reload while signed in no longer opens it.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: george-yeo
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-10-22
 * Scope (2026-10-22): Required-field asterisk (George) on Pick-up from, What do you need?,
 *        Deliver to and Offer, the fields POST /orders rejects as missing.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-22
 * Scope: /requests/new and /requests/:id/edit are now wrapped in RequireAuth (App.jsx), which
 *        replaces the gating effect and the inline requireLogin check in onPost that opened
 *        the deleted LoginModal. `credits` now comes from the new AuthContext instead of
 *        DemoContext, per instructions.md Stage 16b.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Posting or editing an errand now lands on /my-errands instead of the removed
 *        /activity, per instructions.md Stage 22 ("Links that went to /activity from the
 *        request form ... go to /my-errands").
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Replaced native dropdowns with the requested searchable control.
 * Author review: Congchen
 * Scope (2026-11-08, Codex, model: GPT-6): Aligned dropdown chevrons by moving field spacing outside the control.
 * Author review: Congchen
 * Scope (2026-11-09, Claude Code, model: claude-sonnet-5-5): Raised the delivery details input maxLength from 200 to 250 to match the existing 250 limit (order-service validation and the on-screen counter).
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): Complete-by toggle - the ASAP option reads "ASAP" / "By 1 hour from
 *        now" (George, 2026-11-09); order-service fills in the one-hour default.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09): POST /orders is synchronous (George, 2026-11-09) - Post waits for the
 *        response and shows its message on failure; the socket wait and /orders/mine re-check
 *        for the reservation outcome are removed.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 * Scope (2026-11-09, Codex, model: GPT-6): Resolved merge conflicts in disclosure headers.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-09
 * Scope: Stage 28 g (instructions.md) - added `seriesMode`: the same form now also creates/
 *        edits a recurring errand (/series/new, /series/:id/edit), reusing every shared
 *        field (supplier, description, location, details, credits, additional details) and
 *        adding series-only sections: Start (now/later - revives and repurposes the
 *        commented-out "Schedule for later" stub below, since there is no separate
 *        single-post scheduling feature), Repeat (RecurrencePicker), and a "deliver by"
 *        date/time picker whose gap from the start time becomes durationMinutes. The normal
 *        order path (seriesMode omitted/false) is unchanged.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-09, Codex, model: GPT-6): Resolved merge conflict in disclosure header.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Scope (2026-11-10, Codex, model: GPT-6): Moved the credit notice and submit actions below Anything else on mobile per user instruction.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 32 (instructions.md) - the normal errand form (/requests/new) now also creates
 *        delayed and recurring errands directly, replacing the separate /series/new route and
 *        the seriesMode-gated create UI: a "When should this order be sent?" toggle (Send
 *        now/Send later) and a "Repeat this errand" checkbox that expands the recurrence
 *        picker inline. ASAP is hidden under "When do you need it by?" whenever Send later is
 *        chosen (team decision); a one-time scheduled errand is a series with rrule
 *        "...;COUNT=1". The credits remark/hint under "When do you need it by?" stay visible
 *        whenever Send now is chosen, including with Repeat ticked (team decision), and are
 *        hidden for Send later. Editing a series (/series/:id/edit) is otherwise unchanged:
 *        its start time still cannot be edited here, since PATCH /orders/series/:id/edit has
 *        no field for it (order-service) - flagged to the team rather than worked around, and
 *        the team decided to leave that gap for a future stage. The duration computed from
 *        "deliver by" minus the start time is now a hard validation error past 24 hours
 *        (max 1440 minutes) rather than silently capped, for both creating and editing a
 *        series, per the stage's test list.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-11
 * Scope: "By a specific time" date/time fields now default to 1 hour from the current time
 *        instead of a hardcoded 15:30, per user request in chat. No requirements,
 *        architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-11
 * Scope: "Send later" start date/time fields now default to 1 hour from the current time
 *        instead of today at 09:00, matching the "By a specific time" default above, per
 *        user request in chat. No requirements, architecture, schema, or API decisions were
 *        made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-11
 * Scope: "When do you need it by?" now defaults to 1 hour after the order is sent (1 hour
 *        from now for Send now, 1 hour after the chosen Send-later time) instead of always
 *        1 hour from now. The default is recomputed from the Send now/later toggle and the
 *        Send-later date/time inputs, and left alone once the user hand-edits the deadline
 *        field itself, per user request in chat. No requirements, architecture, schema, or
 *        API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-sonnet-5-5), date: 2026-11-11
 * Scope: the supplier picker now loads every supplier (listAllSuppliers) instead of the first page (team decision in chat, 2026-11-11).
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import SearchableSelect from "../components/SearchableSelect";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";
import Button from "../components/Button";
import SupplierImage from "../components/SupplierImage";
import RecurrencePicker from "../components/RecurrencePicker";
import { useApi, useReferenceData } from "../api/useApi";
import { getSupplier, listAllSuppliers } from "../api/suppliers";
import { createOrder, editOrder, listMyOrders } from "../api/orders";
import {
  createSeries,
  editSeries,
  getSeries,
  seriesErrorMessage,
} from "../api/series";
import {
  buildRuleText,
  defaultRuleState,
  parseRuleText,
} from "../domain/seriesRule";
import { qualifiedName } from "../data/suppliers";
import { useAuth } from "../context/AuthContext";
import { getLastRequest, saveLastRequest } from "../api/lastRequest";

const MAX_CHARS = 200;
const MAX_DURATION_MINUTES = 1440;

// Defaults follow the clock rather than a hardcoded date that goes stale overnight.
const today = () => new Date().toISOString().slice(0, 10);

const pad = (n) => String(n).padStart(2, "0");
// Local date and time inputs for an ISO timestamp.
const localDate = (iso) => {
  const d = new Date(iso);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const localTime = (iso) => {
  const d = new Date(iso);
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};

// Order F18 (Wen Xi's edit page, carried over): /requests/:id/edit reuses the form for one of the
// requester's errands. The form mounts once that order is loaded, so its fields start from it.
// Stage 28 g: /series/:id/edit reuses the same form to edit a recurring errand (seriesMode),
// loading a series (getSeries) instead of an order. Stage 32: creating one (/requests/new) no
// longer needs seriesMode - the create form always offers the schedule/repeat options itself.
export default function CreateRequest({ seriesMode = false }) {
  const { id: editId } = useParams();
  const {
    data: orderData,
    loading: orderLoading,
    error: orderError,
  } = useApi(
    () =>
      !seriesMode && editId ? listMyOrders("requester") : Promise.resolve(null),
    [seriesMode, editId],
  );
  const {
    data: seriesData,
    loading: seriesLoading,
    error: seriesError,
  } = useApi(
    () => (seriesMode && editId ? getSeries(editId) : Promise.resolve(null)),
    [seriesMode, editId],
  );

  if (!editId) return <RequestForm order={null} series={null} />;

  if (seriesMode) {
    if (seriesData)
      return (
        <RequestForm key={seriesData.id} order={null} series={seriesData} />
      );
    return (
      <div className="page-gutter mx-auto w-full max-w-[640px] py-8 md:py-10">
        <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">
          Edit recurring errand
        </h1>
        {seriesLoading || (!seriesData && !seriesError) ? (
          <p className="mt-4 text-sm text-ink-70">Loading…</p>
        ) : (
          <p role="alert" className="mt-4 text-sm text-alert">
            {seriesError
              ? seriesErrorMessage(seriesError)
              : "This recurring errand was not found."}
          </p>
        )}
      </div>
    );
  }

  const order = orderData?.orders?.find((o) => o.id === editId);
  if (order) return <RequestForm key={order.id} order={order} series={null} />;
  return (
    <div className="page-gutter mx-auto w-full max-w-[640px] py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">
        Edit errand
      </h1>
      {orderLoading || (!orderData && !orderError) ? (
        <p className="mt-4 text-sm text-ink-70">Loading errand…</p>
      ) : (
        <p role="alert" className="mt-4 text-sm text-alert">
          {orderError ? orderError.message : "This errand was not found."}
        </p>
      )}
    </div>
  );
}

// Order F1.1.1 — supplier, description, delivery location, credits offered, expiration,
// additional details. Plus the scheduled-errand and bookmarked-location nice-to-haves.
// `order` is the errand being edited (F18), `series` the recurring errand being edited
// (Stage 28 g), or both null when posting/creating a new one (which, per Stage 32, can
// itself become a delayed or recurring errand depending on the Send-later/Repeat choices
// below).
function RequestForm({ order, series }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { credits } = useAuth();
  const isEditOrder = order !== null;
  const isEditSeries = series !== null;
  const isEdit = isEditOrder || isEditSeries;

  const [supplierId, setSupplierId] = useState(
    isEdit
      ? String((series ?? order).supplierId)
      : params.get("supplier") || "",
  );
  const [description, setDescription] = useState(
    (series ?? order)?.description ?? "",
  );
  const [details, setDetails] = useState(
    (series ?? order)?.deliveryDetails ?? "",
  );
  const { data: last, loading: lastLoading } = useApi(
    () => (isEdit ? Promise.resolve(null) : getLastRequest().catch(() => null)),
    [],
  );
  const [locationId, setLocationId] = useState(
    isEdit ? String((series ?? order).deliveryLocationId) : "",
  );
  const [timing, setTiming] = useState(order?.completeBy ? "later" : "asap");
  // "By a specific time" defaults to 1 hour from now when not editing an existing deadline.
  const [date, setDate] = useState(() =>
    order?.completeBy
      ? localDate(order.completeBy)
      : localDate(new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  const [time, setTime] = useState(() =>
    order?.completeBy
      ? localTime(order.completeBy)
      : localTime(new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  // Once the "needed by" date/time has been hand-edited, the send-mode effect below leaves it
  // alone rather than clobbering the user's choice.
  const [deadlineTouched, setDeadlineTouched] = useState(false);
  const [offer, setOffer] = useState(series?.credits ?? 4);
  const [extra, setExtra] = useState(
    (series ?? order)?.additionalDetails ?? "",
  );
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState(null);
  const [dismissedLocation, setDismissedLocation] = useState(false);
  const { locations, loading: locationsLoading } = useReferenceData();
  const savedLocation =
    !isEdit &&
    last?.last_req_del_loc_id != null &&
    last.last_req_del_loc_details &&
    last.last_req_del_loc_details !== "Nil"
      ? locations.find(
          (l) => Number(l.location_id) === Number(last.last_req_del_loc_id),
        )
      : null;

  // Stage 32: when creating (not isEdit), "When should this order be sent?" (Send now/Send
  // later) and "Repeat this errand" together decide whether this becomes a normal order, a
  // one-time scheduled series (rrule ending in COUNT=1), or a recurring one.
  const [sendMode, setSendMode] = useState("now");
  const [repeat, setRepeat] = useState(false);
  // "Send later" defaults to 1 hour from now, same as "By a specific time" above.
  const [startDate, setStartDate] = useState(() =>
    localDate(new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  const [startTime, setStartTime] = useState(() =>
    localTime(new Date(Date.now() + 60 * 60_000).toISOString()),
  );
  const [ruleState, setRuleState] = useState(() =>
    isEditSeries
      ? parseRuleText(series.rrule, new Date(series.startAt))
      : defaultRuleState(new Date()),
  );

  // "When do you need it by?" defaults to 1 hour after the order is sent: 1 hour from now for
  // Send now, or 1 hour after the chosen Send-later time (so 2 hours from now by default, since
  // Send later itself defaults to 1 hour from now). Applied from the event that changes the
  // send time, and skipped once the user has hand-edited the deadline themselves.
  const applyDeadlineDefault = (sendAnchor) => {
    if (deadlineTouched || Number.isNaN(sendAnchor.getTime())) return;
    const deadlineDefault = new Date(sendAnchor.getTime() + 60 * 60_000);
    setDate(localDate(deadlineDefault.toISOString()));
    setTime(localTime(deadlineDefault.toISOString()));
  };

  // Stage 28 g: series-only fields for editing an existing series. `startAt` can't be edited
  // once created (editSeries has no such field - order-service), so there is no start-time
  // field here; see the file header for why this stays a known gap rather than a workaround.
  const [deliverByDate, setDeliverByDate] = useState(() => {
    if (!isEditSeries) return today();
    const anchorMs = new Date(series.startAt).getTime();
    const durationMs = (series.durationMinutes ?? 60) * 60_000;
    return localDate(new Date(anchorMs + durationMs).toISOString());
  });
  const [deliverByTime, setDeliverByTime] = useState(() => {
    if (!isEditSeries) return "10:00";
    const anchorMs = new Date(series.startAt).getTime();
    const durationMs = (series.durationMinutes ?? 60) * 60_000;
    return localTime(new Date(anchorMs + durationMs).toISOString());
  });
  const seriesAnchor = isEditSeries ? new Date(series.startAt) : null;
  const seriesAnchorInvalid =
    isEditSeries && Number.isNaN(seriesAnchor.getTime());
  const seriesDeliverBy = isEditSeries
    ? new Date(deliverByDate + "T" + deliverByTime)
    : null;
  const seriesDeliverByInvalid =
    isEditSeries && Number.isNaN(seriesDeliverBy.getTime());
  const seriesDeliverByTooEarly =
    isEditSeries &&
    !seriesAnchorInvalid &&
    !seriesDeliverByInvalid &&
    seriesDeliverBy.getTime() <= seriesAnchor.getTime();
  const seriesGapMinutes =
    isEditSeries &&
    !seriesAnchorInvalid &&
    !seriesDeliverByInvalid &&
    !seriesDeliverByTooEarly
      ? Math.round(
          (seriesDeliverBy.getTime() - seriesAnchor.getTime()) / 60_000,
        )
      : null;
  const seriesDeliverByTooLate =
    seriesGapMinutes !== null && seriesGapMinutes > MAX_DURATION_MINUTES;

  // Stage 32: for creating, `isSeriesCreate` is true whenever the result has to be a series
  // (scheduled for later, and/or repeating) rather than a normal order.
  const isSeriesCreate = !isEdit && (repeat || sendMode === "later");
  const createAnchor = !isEdit
    ? sendMode === "now"
      ? new Date()
      : new Date(startDate + "T" + startTime)
    : null;
  const createAnchorInvalid =
    !isEdit && sendMode === "later" && Number.isNaN(createAnchor.getTime());
  // ASAP only makes sense relative to "now", so it is hidden once the order itself is
  // scheduled for later (team decision) - "When do you need it by?" then always asks for a
  // specific time.
  const asapAvailable = isEditOrder || (!isEdit && sendMode === "now");
  const effectiveTiming = asapAvailable ? timing : "later";

  // The supplier comes from the Supplier Service; the picker lists every supplier.
  const { data: supplierPage } = useApi(
    () => listAllSuppliers({ sortOrder: "A-Z" }),
    [],
  );
  const { data: chosen } = useApi(
    () => (supplierId ? getSupplier(supplierId) : Promise.resolve(null)),
    [supplierId],
  );
  const suppliers = supplierPage?.data ?? [];
  const supplier = supplierId ? chosen : null;

  // Series credits stay editable (instructions.md: "all fields editable, including credits"),
  // unlike a normal order's offer, which is fixed once posted.
  const insufficient = (!isEdit || isEditSeries) && offer > credits.available;
  const remaining = credits.available - offer;
  const deadline =
    effectiveTiming === "later" ? new Date(date + "T" + time) : null;
  const deadlineInvalid = deadline !== null && Number.isNaN(deadline.getTime());
  const createGapMinutes =
    isSeriesCreate && deadline && !deadlineInvalid && !createAnchorInvalid
      ? Math.round((deadline.getTime() - createAnchor.getTime()) / 60_000)
      : null;
  const createDeliverByTooEarly =
    createGapMinutes !== null && createGapMinutes <= 0;
  const createDeliverByTooLate =
    createGapMinutes !== null && createGapMinutes > MAX_DURATION_MINUTES;

  const complete = isEditOrder
    ? Boolean(
        supplierId && description.trim() && locationId && details.trim(),
      ) && !deadlineInvalid
    : isEditSeries
      ? Boolean(
          supplierId && description.trim() && locationId && details.trim(),
        ) &&
        !seriesAnchorInvalid &&
        !seriesDeliverByInvalid &&
        !seriesDeliverByTooEarly &&
        !seriesDeliverByTooLate
      : Boolean(
          supplierId && description.trim() && locationId && details.trim(),
        ) &&
        !createAnchorInvalid &&
        !deadlineInvalid &&
        !createDeliverByTooEarly &&
        !createDeliverByTooLate;

  // One-time scheduled errand (Send later, Repeat unticked): a series whose rrule ends after
  // its first occurrence (Stage 32 spec, "derived from the Stage 28 spec: a one-time errand is
  // a series with COUNT=1").
  const oneTimeRuleText = () =>
    buildRuleText({
      ...defaultRuleState(createAnchor ?? new Date()),
      end: { type: "after", count: 1 },
    });

  const onSubmit = async () => {
    setPosting(true);
    setPostError(null);
    const exact = details.trim();
    saveLastRequest(locationId, exact).catch(() => {});
    try {
      if (isEditOrder) {
        // F18: PATCH /orders/:id/edit with the editable fields; credits stay as reserved.
        await editOrder(order.id, {
          supplierId: Number(supplierId),
          description: description.trim(),
          deliveryLocationId: Number(locationId),
          deliveryDetails: exact,
          completeBy: deadline ? deadline.toISOString() : null,
          additionalDetails: extra.trim() || null,
        });
      } else if (isEditSeries) {
        // Stage 28 g: PATCH /orders/series/:id/edit. startAt can't change, so it isn't sent.
        await editSeries(series.id, {
          supplierId: Number(supplierId),
          description: description.trim(),
          deliveryLocationId: Number(locationId),
          deliveryDetails: exact,
          credits: offer,
          rrule: buildRuleText(ruleState),
          durationMinutes: seriesGapMinutes,
          additionalDetails: extra.trim() || null,
        });
      } else if (isSeriesCreate) {
        // Stage 32: POST /orders/series. Each occurrence reserves its own credits when it
        // posts. ASAP omits durationMinutes, same as a normal order omitting completeBy -
        // order-service defaults it (currently 60 minutes).
        await createSeries({
          supplierId: Number(supplierId),
          description: description.trim(),
          deliveryLocationId: Number(locationId),
          deliveryDetails: exact,
          credits: offer,
          rrule: repeat ? buildRuleText(ruleState) : oneTimeRuleText(),
          ...(createGapMinutes !== null && {
            durationMinutes: createGapMinutes,
          }),
          additionalDetails: extra.trim() || null,
          ...(sendMode === "now"
            ? { startNow: true }
            : { startAt: createAnchor.toISOString() }),
        });
      } else {
        // POST /orders reserves the credits before it answers: 201 means the errand is open,
        // and a failure (409 pending order, 422 refused, 503 credit-service down) carries its
        // message.
        await createOrder({
          supplierId: Number(supplierId),
          description: description.trim(),
          deliveryLocationId: Number(locationId),
          deliveryDetails: exact,
          credits: offer,
          ...(deadline && { completeBy: deadline.toISOString() }),
          additionalDetails: extra.trim() || null,
        });
      }
      navigate("/my-errands");
    } catch (e) {
      setPostError(
        isEditSeries || isSeriesCreate ? seriesErrorMessage(e) : e.message,
      );
    } finally {
      setPosting(false);
    }
  };

  const requiredMark = (
    <>
      <span aria-hidden="true" className="text-alert">
        {" "}
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );

  const label = (text, htmlFor, required = false) => (
    <label htmlFor={htmlFor} className="block text-base font-semibold text-ink">
      {text}
      {required && requiredMark}
    </label>
  );

  const postingNow = !isEdit && sendMode === "now" && !repeat;
  const submitLabel = isEdit
    ? "Save changes"
    : postingNow
      ? "Post errand"
      : "Schedule errand";
  const submitLoadingLabel = isEdit
    ? "Saving…"
    : postingNow
      ? "Posting…"
      : "Scheduling…";

  return (
    <div className="page-gutter mx-auto w-full max-w-[640px] py-8 md:py-10">
      <h1 className="font-display text-2xl font-bold text-ink md:text-3xl">
        {isEditSeries
          ? "Edit recurring errand"
          : isEditOrder
            ? "Edit errand"
            : "Post an errand"}
      </h1>

      <div className="mt-8 space-y-8">
        {/* 1. Pick-up from */}
        <section>
          {label("Pick-up from", "supplier", true)}
          {supplier ? (
            <div className="mt-2 flex items-center gap-3 rounded-card border border-line p-3">
              <div className="w-16 shrink-0">
                <SupplierImage
                  supplier={supplier}
                  ratio="aspect-square"
                  rounded="rounded-[10px]"
                  compact
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {qualifiedName(supplier)}
                </p>
                <p className="truncate text-sm text-ink-40">
                  {supplier.faculty}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSupplierId("")}
                className="min-h-[44px] shrink-0 px-2 py-2 text-sm font-medium text-blue hover:underline md:min-h-0"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="mt-2">
              <SearchableSelect
                id="supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
              >
                <option value="">Choose a stall</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {qualifiedName(s)}
                  </option>
                ))}
              </SearchableSelect>
            </div>
          )}
        </section>

        {/* 2. What do you need? */}
        <section>
          {label("What do you need?", "description", true)}
          <textarea
            id="description"
            rows={4}
            maxLength={MAX_CHARS}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. 1x chicken rice, no cucumber, chilli separate."
            className="mt-2 w-full resize-none rounded-btn border border-line bg-surface p-3 text-base text-ink"
          />
          <div className="mt-1.5 flex items-start justify-between gap-4">
            <p className="max-w-prose text-sm text-ink-40">
              Be specific. Your courier is buying this for you, so mention
              anything that matters.
            </p>
            <span className="tnum shrink-0 text-sm text-ink-40">
              {description.length}/{MAX_CHARS}
            </span>
          </div>
        </section>

        {/* 3. Deliver to */}
        <section>
          {label("Deliver to", "location", true)}
          {savedLocation && !dismissedLocation && (
            <div className="mt-2 rounded-card border border-line p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">Your previous location?</p>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Dismiss"
                    onClick={() => setDismissedLocation(true)}
                  >
                    <X size={18} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    aria-label="Confirm"
                    onClick={() => {
                      setLocationId(String(last.last_req_del_loc_id));
                      setDetails(last.last_req_del_loc_details);
                      setDismissedLocation(true);
                    }}
                  >
                    <Check size={18} aria-hidden="true" />
                  </Button>
                </div>
              </div>
              <p>
                {savedLocation.location}
                <br />
                {last.last_req_del_loc_details}
              </p>
            </div>
          )}
          {(isEdit ||
            dismissedLocation ||
            (!lastLoading && !locationsLoading && !savedLocation)) && (
            <>
              {/* Delivery locations are the Supplier Service's location reference list (ids). */}
              <div className="mt-2">
                <SearchableSelect
                  id="location"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                >
                  <option value="">Choose a drop-off point</option>
                  {locations.map((l) => (
                    <option key={l.location_id} value={l.location_id}>
                      {l.location}
                    </option>
                  ))}
                </SearchableSelect>
              </div>
              <div className="mt-4">
                {label("Exact delivery details", "delivery-details", true)}
                <input
                  id="delivery-details"
                  type="text"
                  maxLength={250}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="e.g. Meet at the side entrance."
                  className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
                <span className="tnum text-sm text-ink-40">
                  {details.length}/250
                </span>
              </div>
            </>
          )}
        </section>

        {/* 4. When should this order be sent? (creating only). Send now vs. Send later -
            Stage 32's version of the old series-only "Start" toggle, now offered for every
            new errand, not just a recurring one. */}
        {!isEdit && (
          <section>
            <span className="block text-base font-semibold text-ink">
              When should this order be sent?
            </span>
            <div className="mt-2 inline-flex w-full rounded-btn border border-line p-1">
              {[
                ["now", "Send now"],
                ["later", "Send later"],
              ].map(([value, text]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setSendMode(value);
                    applyDeadlineDefault(
                      value === "now"
                        ? new Date()
                        : new Date(startDate + "T" + startTime),
                    );
                  }}
                  aria-pressed={sendMode === value}
                  className={
                    "h-11 md:h-10 flex-1 rounded-[7px] px-3 text-sm font-medium transition-colors duration-150 " +
                    (sendMode === value
                      ? "bg-ink text-white"
                      : "text-ink-70 hover:text-ink")
                  }
                >
                  {text}
                </button>
              ))}
            </div>
            {sendMode === "later" && (
              <div className="foc-fade mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-ink-70">Date</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      applyDeadlineDefault(
                        new Date(e.target.value + "T" + startTime),
                      );
                    }}
                    className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-ink-70">Time</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      applyDeadlineDefault(
                        new Date(startDate + "T" + e.target.value),
                      );
                    }}
                    className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                  />
                </label>
              </div>
            )}
          </section>
        )}

        {/* 5. When do you need it by? Series edit keeps the absolute "deliver by" picker
            (unchanged from Stage 28 g); creating and editing a normal order share the
            ASAP/specific-time toggle, with ASAP hidden once Send later is chosen above. */}
        {isEditSeries ? (
          <section>
            <span className="block text-base font-semibold text-ink">
              When do you need it by?
            </span>
            <div className="foc-fade mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-ink-70">Date</span>
                <input
                  type="date"
                  value={deliverByDate}
                  onChange={(e) => setDeliverByDate(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
              <label className="block">
                <span className="text-sm text-ink-70">Time</span>
                <input
                  type="time"
                  value={deliverByTime}
                  onChange={(e) => setDeliverByTime(e.target.value)}
                  className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                />
              </label>
            </div>
            {seriesDeliverByTooEarly ? (
              <p className="mt-1.5 max-w-prose text-sm text-alert">
                This has to be after when the errand starts.
              </p>
            ) : seriesDeliverByTooLate ? (
              <p className="mt-1.5 max-w-prose text-sm text-alert">
                This can be at most 24 hours after when the errand starts.
              </p>
            ) : (
              <p className="mt-1.5 max-w-prose text-sm text-ink-40">
                The gap between this and the start time becomes the deadline for
                every future occurrence (at most 24 hours).
              </p>
            )}
          </section>
        ) : (
          <section>
            <span className="block text-base font-semibold text-ink">
              When do you need it by?
            </span>
            <div className="mt-2 inline-flex w-full rounded-btn border border-line p-1">
              {/* ASAP sends no complete-by, so order-service sets it to an hour from now
                  (George, 2026-11-09). Hidden once Send later is chosen (team decision,
                  Stage 32): a relative "ASAP" has no meaning once the post itself is
                  scheduled for a later, user-chosen time. */}
              {(asapAvailable
                ? [
                    ["asap", "ASAP", "By 1 hour from now"],
                    ["later", "By a specific time", null],
                  ]
                : [["later", "By a specific time", null]]
              ).map(([value, text, hint]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTiming(value)}
                  aria-pressed={effectiveTiming === value}
                  className={
                    "min-h-11 md:min-h-10 flex-1 rounded-[7px] px-3 py-1 text-sm font-medium leading-tight transition-colors duration-150 " +
                    (effectiveTiming === value
                      ? "bg-ink text-white"
                      : "text-ink-70 hover:text-ink")
                  }
                >
                  <span className="block">{text}</span>
                  {hint && (
                    <span
                      className={
                        "block text-xs font-normal " +
                        (effectiveTiming === value
                          ? "text-white/80"
                          : "text-ink-40")
                      }
                    >
                      {hint}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {effectiveTiming === "later" && (
              <div className="foc-fade mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-ink-70">Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDeadlineTouched(true);
                      setDate(e.target.value);
                    }}
                    className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-ink-70">Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      setDeadlineTouched(true);
                      setTime(e.target.value);
                    }}
                    className="mt-1 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
                  />
                </label>
              </div>
            )}
            {isSeriesCreate && createDeliverByTooEarly && (
              <p className="mt-1.5 max-w-prose text-sm text-alert">
                This has to be after when the errand is sent.
              </p>
            )}
            {isSeriesCreate && createDeliverByTooLate && (
              <p className="mt-1.5 max-w-prose text-sm text-alert">
                This can be at most 24 hours after when the errand is sent.
              </p>
            )}
            {!isSeriesCreate && (
              <p className="mt-1.5 max-w-prose text-sm text-ink-40">
                This is when the food should reach you. Your courier sees it
                before accepting.
              </p>
            )}
          </section>
        )}

        {/* 6. Recurrence (creating only): ticking "Repeat this errand" expands the recurrence
            picker inline. Editing an existing series keeps its own always-visible Repeat
            section below, unchanged from Stage 28 g. */}
        {!isEdit && (
          <section>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={repeat}
                onChange={(e) => setRepeat(e.target.checked)}
                className="h-5 w-5 rounded border border-line text-ink"
              />
              <span className="text-base font-semibold text-ink">
                Repeat this errand
              </span>
            </label>
            {repeat && (
              <div className="foc-fade mt-3">
                <RecurrencePicker value={ruleState} onChange={setRuleState} />
              </div>
            )}
          </section>
        )}

        {/* 6b. Repeat (editing a series). */}
        {isEditSeries && (
          <section>
            <span className="block text-base font-semibold text-ink">
              Repeat
            </span>
            <div className="mt-2">
              <RecurrencePicker value={ruleState} onChange={setRuleState} />
            </div>
          </section>
        )}

        {/* 7. Expiration: how long the request stays on the board unaccepted.
            Hidden for now (George, 2026-10-20); restore EXPIRY_CHOICES, expiry state and
            deadlineTooTight with it.
        <section>
          <span className="block text-base font-semibold text-ink">
            How long should this stay open?
          </span>
          <div className="hide-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {EXPIRY_CHOICES.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setExpiry(mins)}
                aria-pressed={expiry === mins}
                className={
                  'h-11 md:h-10 shrink-0 rounded-pill border px-4 text-sm font-medium transition-colors duration-150 ' +
                  (expiry === mins
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-surface text-ink-70 hover:border-ink hover:text-ink')
                }
              >
                {mins < 60 ? mins + ' min' : mins / 60 + (mins === 60 ? ' hour' : ' hours')}
              </button>
            ))}
          </div>
          <p className="mt-1.5 max-w-prose text-sm text-ink-40">
            If nobody accepts it within{' '}
            {expiry < 60 ? expiry + ' minutes' : expiry / 60 + (expiry === 60 ? ' hour' : ' hours')}{' '}
            {postMode === 'schedule' ? 'of it going out' : 'of posting'}, the errand expires and
            your reserved credits come straight back.
          </p>
          {deadlineTooTight && (
            <p className="mt-1.5 max-w-prose text-sm text-alert">
              This errand could still be unaccepted at {time}. Shorten how long it stays open, or
              give a later time to deliver by.
            </p>
          )}
        </section> */}

        {/* 8. Offer: fixed once posted for a normal order, so hidden when editing one. A
            series' credits stay editable, so it is always shown when creating or editing one. */}
        {(!isEdit || isEditSeries) && (
          <section>
            <span className="block text-base font-semibold text-ink">
              Offer
              {requiredMark}
            </span>
            <div
              className={
                "mt-2 inline-flex h-16 items-center gap-6 rounded-btn border px-4 " +
                (insufficient ? "border-alert" : "border-line")
              }
            >
              <button
                type="button"
                onClick={() => setOffer((v) => Math.max(1, v - 1))}
                disabled={offer <= 1}
                aria-label="Offer one credit fewer"
                className="flex h-11 w-11 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <span className="tnum min-w-[3ch] text-center text-2xl font-semibold text-ink">
                {offer}
              </span>
              <button
                type="button"
                onClick={() => setOffer((v) => Math.min(10, v + 1))}
                disabled={offer >= 10}
                aria-label="Offer one credit more"
                className="flex h-11 w-11 items-center justify-center rounded-pill border border-line text-ink disabled:text-ink-40"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>

            {insufficient ? (
              /* Credit F1.2.2 — insufficient credits. */
              <p className="mt-2 max-w-prose text-sm text-alert">
                You have <span className="tnum">{credits.total}</span> credits,{" "}
                <span className="tnum">{credits.reserved}</span> of them
                reserved. Lower your offer or wait for an errand to complete.
              </p>
            ) : isEdit || sendMode === "now" ? (
              <p className="mt-2 text-sm text-ink-40">
                After posting, you&rsquo;ll have{" "}
                <span className="tnum">{remaining}</span> of{" "}
                <span className="tnum">{credits.available}</span> credits
                available.
              </p>
            ) : null}
          </section>
        )}

        {/* 9. Anything else? */}
        <section>
          {label("Anything else?", "extra")}
          <input
            id="extra"
            type="text"
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
            placeholder="e.g. If I am uncontactable, you may leave it with the security guard."
            className="mt-2 h-12 w-full rounded-btn border border-line bg-surface px-3 text-base text-ink"
          />
        </section>
      </div>

      {/* AI-generated (edited by <name>). Actions scroll with the form below Anything else. */}
      <div className="mt-8 border-t border-line bg-surface pt-6 md:mt-10">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="max-w-prose text-sm text-ink-70">
              {isEditSeries ? (
                "Changes apply to future occurrences only; orders already posted are unaffected."
              ) : isEditOrder ? (
                "Update the details of this open errand."
              ) : sendMode === "now" ? (
                <>
                  <span className="tnum">{offer}</span> credits will be reserved
                  until this errand is completed or cancelled
                </>
              ) : null}
            </p>
            {postError && (
              <p role="alert" className="max-w-prose text-sm text-alert">
                {postError}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="ghost"
              className="flex-1 md:flex-none"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 md:flex-none"
              disabled={insufficient || !complete || posting}
              onClick={onSubmit}
            >
              {posting && (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {posting ? submitLoadingLabel : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
