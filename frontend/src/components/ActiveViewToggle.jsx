/*
 * AI Assistance Disclosure:
 * Scope (2026-11-10, Codex, model: GPT-6): Batched optimistic mode and navigation updates for one redirect toast.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-10-23
 * Scope: Created the requester/courier view toggle, per instructions.md Stage 16f. Reads
 *        AuthContext.user.activeView and calls AuthContext.setActiveView, which already does
 *        the optimistic update + revert-on-failure (built in Stage 16b in anticipation of this
 *        sub-stage); this component only renders the two segments and shows a toast on the
 *        error setActiveView rethrows.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope (2026-11-09): Switching view while on a page of the old view only (e.g. Suppliers ->
 *        courier) now goes to the new view's main page (Find errands / Suppliers) instead of
 *        showing the blocked-page message, and back to the original page if the switch fails
 *        (George, 2026-11-09; replaces Stage 22's "user stays on the current page" for the
 *        toggle). Opening another view's page directly still shows the blocked page.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 29 - the leaving-page redirect now replaces the history entry (instructions.md
 *        Stage 29's "History" row) and shows the "You are now in <view> mode" toast on success,
 *        matching every other redirect this stage adds. The failure revert now explicitly
 *        navigates back to the page the user was on (replace, not push, and only if they are
 *        still on the main page the toggle sent them to) instead of relying on navigate(-1),
 *        per the stage's "Toggle failure" row; locationRef tracks the live pathname since the
 *        async closure's own `location` is stale by the time the revert runs.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { startTransition, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bike, ShoppingBag } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { describeError } from "../api/errorMessages";
import { VIEW_MODE_LABEL, mainPageFor, viewForPath } from "../routing/views";

const VIEWS = [
  { value: "requester", label: "Requester", icon: ShoppingBag },
  { value: "courier", label: "Courier", icon: Bike },
];

export default function ActiveViewToggle({ className = "" }) {
  const { user, setActiveView } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const locationRef = useRef(location.pathname);

  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  if (!user) return null;

  const select = async (value) => {
    if (value === user.activeView || pending) return;
    setPending(true);
    // On a page that belongs only to the view being left, go to the new view's main page
    // (George, 2026-11-09) instead of showing the blocked-page message. The navigate and
    // setActiveView's optimistic flip happen in the same tick, so React renders them together
    // and the blocked page never flashes. The redirect replaces the history entry (Stage 29).
    const leavingPage = viewForPath(location.pathname) === user.activeView;
    const originalPath = location.pathname;
    const target = mainPageFor(value);
    try {
      // AI-generated (edited by <name>).
      // Keep the optimistic view update at the same priority as router navigation.
      // Otherwise the old page can render with the new view and emit another toast.
      let switching;
      startTransition(() => {
        switching = setActiveView(value);
        if (leavingPage) navigate(target, { replace: true });
      });
      await switching;
      if (leavingPage)
        showToast("You are now in " + VIEW_MODE_LABEL[value], "success");
    } catch (err) {
      // setActiveView has already reverted the view; return to the original page, but only if
      // the user is still on the main page the toggle sent them to (Stage 29's "Toggle failure").
      if (leavingPage && locationRef.current === target) {
        navigate(originalPath, { replace: true });
      }
      showToast(describeError(err).message, "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="group"
      aria-label="Requester or courier view"
      className={
        "flex items-center gap-1 rounded-btn bg-surface-alt p-1 " + className
      }
    >
      {VIEWS.map(({ value, label, icon: Icon }) => {
        const active = user.activeView === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            disabled={pending}
            onClick={() => select(value)}
            className={
              "flex h-8 items-center gap-1.5 rounded-btn px-3 text-xs font-medium transition-colors duration-150 disabled:opacity-60 " +
              (active ? "bg-ink text-white" : "text-ink-70 hover:text-ink")
            }
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
