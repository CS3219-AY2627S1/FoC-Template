/*
 * AI Assistance Disclosure (hwangjihun):
 * Tool: ChatGPT (Codex, model: gpt-6-sol), date: 2026-09-24
 * Tool: ChatGPT (Codex, model: gpt-6.1-sol), date: 2026-10-07
 * Scope: Implemented Supplier navigation and integration with the existing shared shell.
 * Author review: I validated correctness, and added boundary checks.
 */

import { useEffect, useState } from "react";
import { isApiRequestError } from "../api/client";
import { type SupplierStatus, supplierService } from "../api/supplier-service";
import { useAuth } from "../app/use-auth";

type Action = "activate" | "deactivate";

export function SupplierStatusActions({ id, name, status, onChanged }: {
  id: string;
  name: string;
  status: SupplierStatus;
  onChanged: (message: string) => void;
}) {
  const { withCurrentAccess } = useAuth();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!action) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setAction(null); setError(null); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [action, busy]);

  async function confirm() {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "deactivate") {
        await withCurrentAccess((token) => supplierService.deactivate(id, token));
        onChanged(`${name} was deactivated. Its record is retained for existing references.`);
      } else {
        await withCurrentAccess((token) => supplierService.update(id, { status: "ACTIVE" }, token));
        onChanged(`${name} was activated.`);
      }
      setAction(null);
    } catch (failure) {
      setError(isApiRequestError(failure) ? failure.message : "We could not update this supplier. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const title = action === "activate" ? "Activate supplier?" : "Deactivate supplier?";
  const explanation = action === "activate"
    ? "This supplier will appear in normal supplier listings again."
    : "This supplier will be hidden from normal supplier listings. Its record will be retained.";

  return <>
    <div className="supplier-status-actions">
      {status === "ACTIVE" ? <button onClick={() => { setError(null); setAction("deactivate"); }} type="button">Deactivate</button> : <button onClick={() => { setError(null); setAction("activate"); }} type="button">Activate</button>}
    </div>
    {action ? <div className="supplier-dialog-backdrop"><div aria-labelledby="supplier-action-title" aria-modal="true" className="supplier-dialog" role="dialog">
      <h2 id="supplier-action-title">{title}</h2><p><strong>{name}</strong>: {explanation}</p>
      {error ? <p className="supplier-dialog-error" role="alert">{error}</p> : null}
      <div className="supplier-dialog-actions"><button autoFocus disabled={busy} onClick={() => { setAction(null); setError(null); }} type="button">Cancel</button><button className="supplier-primary-action" disabled={busy} onClick={() => void confirm()} type="button">{busy ? "Working…" : action === "activate" ? "Activate supplier" : "Deactivate supplier"}</button></div>
    </div></div> : null}
  </>;
}
