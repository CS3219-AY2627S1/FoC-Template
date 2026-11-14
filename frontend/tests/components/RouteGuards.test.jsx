/*
 * AI Assistance Disclosure:
 * Scope (2026-11-10, Codex, model: GPT-6): Added StrictMode coverage for exactly one redirect toast.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-05
 * Scope: Tests for ViewGate (components/RouteGuards.jsx), created for instructions.md Stage
 *        22's "Opening another view's page" and "Toggling the view" rows. useAuth is mocked
 *        with a mutable, vi.hoisted object so the "Switch to <view>" button's call to
 *        setActiveView can simulate AuthContext's real optimistic update: ViewGate re-renders
 *        on its own setSwitching state change and reads the mutated mock on that render,
 *        exactly as it would re-render when the real AuthContext's user.activeView changes.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 29 - rewrote these tests for ViewGate's new redirect behaviour (replaces the
 *        blocked-page message deleted this stage): asserts the user lands on the current
 *        view's main page, the toast fires once, and the history entry is replaced (Back does
 *        not return to the gated page). Removed the switch/go-to-main-page button tests, since
 *        those buttons no longer exist.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewGate } from "../../src/components/RouteGuards";
import { VIEWS } from "../../src/routing/views";

const auth = vi.hoisted(() => ({
  user: { activeView: "requester" },
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("../../src/context/AuthContext", () => ({
  useAuth: () => auth,
}));
vi.mock("../../src/components/Toast", () => ({ useToast: () => toast }));

function renderGated(requiredView, { initialPath = "/gated" } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/gated"
          element={
            <ViewGate requiredView={requiredView}>
              <p>Protected page</p>
            </ViewGate>
          }
        />
        <Route path="/suppliers" element={<p>Suppliers page</p>} />
        <Route path="/requests" element={<p>Find errands page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = { activeView: VIEWS.REQUESTER };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ViewGate", () => {
  // AI-generated (edited by <name>).
  it("shows one redirect toast when StrictMode replays effects", () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/gated"]}>
          <Routes>
            <Route
              path="/gated"
              element={
                <ViewGate requiredView={VIEWS.COURIER}>
                  <p>Protected page</p>
                </ViewGate>
              }
            />
            <Route path="/suppliers" element={<p>Suppliers page</p>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );
    expect(screen.getByText("Suppliers page")).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledTimes(1);
  });

  it("renders the page when the current view matches", () => {
    renderGated(VIEWS.REQUESTER);
    expect(screen.getByText("Protected page")).toBeInTheDocument();
    expect(toast.showToast).not.toHaveBeenCalled();
  });

  it("redirects to the current (requester) view's main page when the gated page needs courier, with a toast", () => {
    renderGated(VIEWS.COURIER);
    expect(screen.queryByText("Protected page")).not.toBeInTheDocument();
    expect(screen.getByText("Suppliers page")).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledWith(
      "You are now in requester mode",
      "success",
    );
  });

  it("and the reverse: in courier view, a requester-only page redirects to Find errands", () => {
    auth.user = { activeView: VIEWS.COURIER };
    renderGated(VIEWS.REQUESTER);
    expect(screen.getByText("Find errands page")).toBeInTheDocument();
    expect(toast.showToast).toHaveBeenCalledWith(
      "You are now in courier mode",
      "success",
    );
  });

  it("replaces the history entry, so Back does not return to the gated page", () => {
    render(
      <MemoryRouter initialEntries={["/requests", "/gated"]} initialIndex={1}>
        <Routes>
          <Route
            path="/gated"
            element={
              <ViewGate requiredView={VIEWS.COURIER}>
                <p>Protected page</p>
              </ViewGate>
            }
          />
          <Route path="/suppliers" element={<p>Suppliers page</p>} />
          <Route path="/requests" element={<p>Find errands page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    // The gated entry was replaced with /suppliers (requester's main page), so the stack is
    // now [/requests, /suppliers] - there is no gated entry left to bounce back to.
    expect(screen.getByText("Suppliers page")).toBeInTheDocument();
  });
});
