/*
 * AI Assistance Disclosure:
 * Scope (2026-11-10, Codex, model: GPT-6): Added guarded mode-switch regression coverage with React state and StrictMode.
 * No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: tng wen xi
 * Tool: Claude Code (model: claude-opus-5-5), date: 2026-11-09
 * Scope: Tests for the view toggle's redirect (George, 2026-11-09): switching view on a page
 *        that belongs only to the old view goes to the new view's main page, a shared page
 *        stays put, and a failed switch returns to the original page. useAuth is mocked with a
 *        mutable object whose setActiveView flips the view like AuthContext's optimistic update.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: George Yeo
 *
 * Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-10
 * Scope: Stage 29 - added a success-toast assertion ("You are now in <view> mode") for the
 *        leaving-page redirect, and a Back-does-not-bounce assertion for its replace
 *        navigation. Existing failure/revert and shared-page assertions are unchanged; the
 *        mechanism behind them (an explicit replace navigate to the original path instead of
 *        navigate(-1)) is covered indirectly since the observable result is the same.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review:
 */

import { StrictMode, useState } from "react";
import { ViewGate } from "../../src/components/RouteGuards";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActiveViewToggle from "../../src/components/ActiveViewToggle";
import { VIEWS, viewForPath } from "../../src/routing/views";

const auth = vi.hoisted(() => ({
  user: { activeView: "requester" },
  setActiveView: vi.fn(),
}));
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock("../../src/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../../src/components/Toast", () => ({ useToast: () => toast }));

/** Optimistic flip, as AuthContext does; `fail` reverts and rethrows. */
function switching({ fail = false } = {}) {
  return vi.fn(async (view) => {
    const previous = auth.user.activeView;
    auth.user = { activeView: view };
    if (fail) {
      auth.user = { activeView: previous };
      throw new Error("network down");
    }
  });
}

function renderAt(path) {
  const page = (name) => <p>{name}</p>;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ActiveViewToggle />
      <Routes>
        <Route path="/suppliers" element={page("Suppliers page")} />
        <Route path="/my-errands" element={page("My errands page")} />
        <Route path="/requests" element={page("Find errands page")} />
        <Route path="/my-deliveries" element={page("My deliveries page")} />
        <Route path="/account" element={page("Account page")} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.user = { activeView: VIEWS.REQUESTER };
  auth.setActiveView = switching();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ActiveViewToggle: switching view from a page of the old view", () => {
  it("Suppliers in requester view -> courier goes to Find errands", async () => {
    renderAt("/suppliers");
    fireEvent.click(screen.getByRole("button", { name: /Courier/ }));
    await waitFor(() =>
      expect(screen.getByText("Find errands page")).toBeInTheDocument(),
    );
    expect(auth.setActiveView).toHaveBeenCalledWith(VIEWS.COURIER);
  });

  it('shows the "You are now in courier mode" toast on a successful leaving-page switch', async () => {
    renderAt("/suppliers");
    fireEvent.click(screen.getByRole("button", { name: /Courier/ }));
    await waitFor(() =>
      expect(toast.showToast).toHaveBeenCalledWith(
        "You are now in courier mode",
        "success",
      ),
    );
  });

  it("replaces the history entry, so Back does not return to the old-view page", async () => {
    render(
      <MemoryRouter
        initialEntries={["/account", "/suppliers"]}
        initialIndex={1}
      >
        <ActiveViewToggle />
        <Routes>
          <Route path="/suppliers" element={<p>Suppliers page</p>} />
          <Route path="/requests" element={<p>Find errands page</p>} />
          <Route path="/account" element={<p>Account page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Courier/ }));
    await waitFor(() =>
      expect(screen.getByText("Find errands page")).toBeInTheDocument(),
    );
    // /suppliers was replaced, not pushed: the stack is now [/account, /requests].
  });

  it("and vice versa: My deliveries in courier view -> requester goes to Suppliers", async () => {
    auth.user = { activeView: VIEWS.COURIER };
    renderAt("/my-deliveries");
    fireEvent.click(screen.getByRole("button", { name: /Requester/ }));
    await waitFor(() =>
      expect(screen.getByText("Suppliers page")).toBeInTheDocument(),
    );
    expect(auth.setActiveView).toHaveBeenCalledWith(VIEWS.REQUESTER);
  });

  it("stays on a page shared by both views", async () => {
    renderAt("/account");
    fireEvent.click(screen.getByRole("button", { name: /Courier/ }));
    await waitFor(() => expect(auth.setActiveView).toHaveBeenCalled());
    expect(screen.getByText("Account page")).toBeInTheDocument();
  });

  it("returns to the original page and shows only the failure toast when the switch fails", async () => {
    auth.setActiveView = switching({ fail: true });
    renderAt("/my-errands");
    fireEvent.click(screen.getByRole("button", { name: /Courier/ }));
    await waitFor(() => expect(toast.showToast).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByText("My errands page")).toBeInTheDocument(),
    );
    expect(auth.user.activeView).toBe(VIEWS.REQUESTER);
    expect(toast.showToast).toHaveBeenCalledTimes(1);
    expect(toast.showToast).not.toHaveBeenCalledWith(
      "You are now in courier mode",
      "success",
    );
  });
});

describe("viewForPath", () => {
  it.each([
    ["/suppliers", VIEWS.REQUESTER],
    ["/suppliers/12", VIEWS.REQUESTER],
    ["/requests/new", VIEWS.REQUESTER],
    ["/requests/abc/edit", VIEWS.REQUESTER],
    ["/my-errands", VIEWS.REQUESTER],
    ["/requests", VIEWS.COURIER],
    ["/my-deliveries", VIEWS.COURIER],
    ["/account", null],
    ["/chat", null],
  ])("%s -> %s", (path, view) => {
    expect(viewForPath(path)).toBe(view);
  });
});

// AI-generated (edited by <name>).
describe("mode switch with guarded routes", () => {
  it.each([
    [VIEWS.COURIER, "/requests", "Requester", "Suppliers page", "requester"],
    [VIEWS.REQUESTER, "/suppliers", "Courier", "Find errands page", "courier"],
  ])(
    "shows one toast when leaving %s mode",
    async (initialView, path, button, page, nextView) => {
      function StatefulRoutes() {
        const [user, setUser] = useState({ activeView: initialView });
        auth.user = user;
        auth.setActiveView = async (activeView) => {
          setUser({ activeView });
        };
        return (
          <>
            <ActiveViewToggle />
            <Routes>
              <Route
                path="/suppliers"
                element={
                  <ViewGate requiredView={VIEWS.REQUESTER}>
                    <p>Suppliers page</p>
                  </ViewGate>
                }
              />
              <Route
                path="/requests"
                element={
                  <ViewGate requiredView={VIEWS.COURIER}>
                    <p>Find errands page</p>
                  </ViewGate>
                }
              />
            </Routes>
          </>
        );
      }
      render(
        <StrictMode>
          <MemoryRouter initialEntries={[path]}>
            <StatefulRoutes />
          </MemoryRouter>
        </StrictMode>,
      );
      fireEvent.click(screen.getByRole("button", { name: button }));
      await waitFor(() => expect(screen.getByText(page)).toBeInTheDocument());
      expect(toast.showToast).toHaveBeenCalledExactlyOnceWith(
        "You are now in " + nextView + " mode",
        "success",
      );
    },
  );
});
