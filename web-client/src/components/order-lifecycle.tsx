// AI Assistance Disclosure:
// Tool: ChatGPT (Codex, model: gpt-6-astra), date: 2026-10-11
// Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-11
// Scope: Implemented participant Order action controls and error/result messages.
// Author review: I validated correctness and added boundary checks where needed.

import { useEffect, useRef, useState } from "react";
import { isApiRequestError } from "../api/client";
import { failureReasonLabel, orderService, stateNames, type OrderAction, type OrderDetail, type OrderParticipant } from "../api/order-service";
import { orderError, orderTime } from "../app/order-presentation";
import { useAuth } from "../app/use-auth";

const labels: Record<OrderAction, string> = {
  accept: "Accept errand", cancel: "Cancel errand", pickup: "Mark picked up",
  deliver: "Mark delivered", complete: "Confirm received",
};
const notices: Record<OrderAction, string> = {
  accept: "You accepted this errand.", cancel: "Errand cancelled. Your reserved credits will be returned.",
  pickup: "Pickup recorded.", deliver: "Delivery recorded. Waiting for the requester to confirm receipt.",
  complete: "Errand completed. Reward payment is not confirmed yet.",
};

export function OrderLifecycle({ order, onChanged, onRefresh }: {
  order: OrderDetail; onChanged: (order: OrderParticipant) => void; onRefresh: () => void;
}) {
  const { user, withCurrentAccess } = useAuth();
  const [now, setNow] = useState(Date.now);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, []);
  const requester = "requesterId" in order && order.requesterId === user?.userId;
  const courier = "courierId" in order && order.courierId === user?.userId;
  // Assessment responses omit requester IDs; the server still enforces self-acceptance.
  const action: OrderAction | null = order.state === "OPEN" ? requester ? "cancel" : "accept"
    : order.state === "ACCEPTED" && courier ? "pickup"
      : order.state === "PICKED_UP" && courier ? "deliver"
        : order.state === "DELIVERED" && requester ? "complete" : null;
  const deadlinePassed = order.state === "OPEN" && now >= Date.parse(order.acceptanceDeadline);
  const confirmRequired = action === "cancel" || action === "complete";
  async function submit() {
    if (inFlight.current || !action || (deadlinePassed && !uncertain)) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const updated = await withCurrentAccess((token) => orderService[action](order.orderId, token));
      if (!mounted.current) return;
      setUncertain(false); setConfirming(false);
      setNotice(notices[action]);
      onChanged(updated);
    } catch (failure) {
      if (!mounted.current) return;
      const unknown = !isApiRequestError(failure) || failure.status === 0 || failure.status >= 500;
      setUncertain(unknown);
      setError(unknown ? "We could not confirm the update. Try again here, or refresh to check the errand." : orderError(failure));
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <section className="order-panel" aria-label="Errand actions" aria-busy={busy}>
    <h2>Errand actions</h2>
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {"overdueAt" in order && order.overdueAt ? <p role="status">{order.state === "FAILED" ? "Was overdue" : order.state === "ACCEPTED" || order.state === "PICKED_UP" ? "Delivery overdue" : "Delivered late"} since {orderTime(order.overdueAt)} SGT.{order.state === "ACCEPTED" || order.state === "PICKED_UP" ? " Late delivery is still allowed." : ""}</p> : null}
    {order.state === "DISPUTED" ? <div role="status">
      <p>This errand is on hold while an administrator reviews a reported problem. Errand actions are paused until the dispute is withdrawn or decided.</p>
      {"disputedFromState" in order && order.disputedFromState ? <p className="order-muted">If the dispute is withdrawn or rejected, the errand continues from {stateNames[order.disputedFromState].toLowerCase()}. If it is accepted, the errand fails and the reward returns to the requester.</p> : null}
    </div> : null}
    {order.state === "FAILED" && "failureReason" in order && order.failureReason ? <div>
      <p>Failure reason: {order.failureReason === "OTHER" ? `Other: ${order.failureDetails ?? ""}` : failureReasonLabel(order.failureReason)}.</p>
      {order.failureReason !== "OTHER" && order.failureDetails ? <p>{order.failureDetails}</p> : null}
      {/* Errands failed before disputed errands were recorded by a participant directly. */}
      <p>{order.decidedByAdministrator ? "An administrator accepted the reported problem" : `Recorded by the ${order.failedBy === order.requesterId ? "requester" : "courier"}`}{order.failedAt ? ` on ${orderTime(order.failedAt)} SGT` : ""}.</p>
      {!notice ? <p>Reserved credits will be returned to the requester.</p> : null}
    </div> : null}
    {order.state === "COMPLETED" && !notice ? <p>{notices.complete}</p> : null}
    {!action ? order.state === "ACCEPTED" || order.state === "PICKED_UP" ? <p>Waiting for the assigned courier to update the errand.</p> : order.state === "DELIVERED" ? <p>Waiting for the requester to confirm receipt.</p> : order.state === "EXPIRED" ? <p>No one accepted this errand in time.</p> : null
      : deadlinePassed && !uncertain ? <p>The acceptance deadline has passed. Refresh to check the errand.</p>
      : <>
        <p>{action === "cancel" ? "You can cancel until someone accepts or the acceptance deadline passes." : action === "accept" ? "Accept this errand to become its courier. You cannot cancel it after accepting." : action === "pickup" ? "Mark picked up only after collecting the requested item." : action === "deliver" ? "Mark delivered only after handing over the item. The requester must confirm receipt before you receive the reward." : "Confirm only after receiving the item. Your courier can then receive the reward."}</p>
        {confirming && !uncertain ? <p>{action === "cancel" ? "Cancel this errand? This cannot be undone." : "Have you received the item? Completion cannot be undone."}</p> : null}
        <div className="order-actions">
          <button className="order-button" disabled={busy} type="button" onClick={() => confirmRequired && !confirming && !uncertain ? setConfirming(true) : void submit()}>
            {busy ? "Confirming…" : uncertain ? "Try again" : confirming ? action === "cancel" ? "Confirm cancellation" : "Complete errand" : labels[action]}
          </button>
          {confirming && !uncertain ? <button className="order-button order-secondary" disabled={busy} type="button" onClick={() => setConfirming(false)}>{action === "cancel" ? "Keep errand" : "Not yet"}</button> : null}
        </div>
      </>}
    {(requester || courier) && (order.state === "ACCEPTED" || order.state === "PICKED_UP" || order.state === "DELIVERED") ? <p className="order-muted">Something wrong? Use Report a problem below. An administrator reviews it before the errand can fail.</p> : null}
    <button className="order-text-button" disabled={busy} type="button" onClick={onRefresh}>Refresh errand</button>
  </section>;
}
