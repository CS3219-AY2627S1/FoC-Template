import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsPage } from "./NotificationsPage";
import * as navigation from "./navigation";

const orderId = "513ea56a-41d5-49ad-b6c5-df81e2dd2b25";

function signIn() {
  sessionStorage.setItem(
    "foc.user-session",
    JSON.stringify({
      accessToken: "signed.jwt",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "97947588-bb2e-42f2-91ba-9abf8e15a8e7",
      username: "mei",
      role: "REQUESTER",
      availableRoles: ["REQUESTER", "COURIER"],
    }),
  );
}

function item(id: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    type: "ORDER_ACCEPTED",
    orderId,
    message: `A courier accepted your errand "Buy coffee ${id}".`,
    occurredAt: "2026-10-30T09:15:00Z",
    readAt: null,
    ...overrides,
  };
}

function page(
  content: unknown[],
  pageNumber = 0,
  totalElements = content.length,
  totalPages = 1,
) {
  return { content, page: pageNumber, size: 20, totalElements, totalPages };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NotificationsPage />
    </QueryClientProvider>,
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(navigation, "navigateTo").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists notifications with an Unread label in text, not colour alone", async () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(
            page([item("a"), item("b", { readAt: "2026-10-30T10:00:00Z" })]),
          ),
        ),
    );
    renderPage();

    const list = await screen.findByRole("list", {
      name: "Your notifications",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Unread")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Errand progress")).toBeInTheDocument();
    expect(within(rows[1]!).queryByText("Unread")).not.toBeInTheDocument();
    expect(
      within(rows[1]!).queryByRole("button", { name: "Mark as read" }),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/notifications/me?page=0&size=20",
      expect.objectContaining({
        headers: { Authorization: "Bearer signed.jwt" },
      }),
    );
  });

  it("shows loading placeholders while the list loads", () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading your notifications",
    );
  });

  it("offers the next useful action when there are none", async () => {
    signIn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(page([]))));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "No notifications yet." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Updates about your errands and credits will appear here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse errands" }),
    ).toHaveAttribute("href", "/errands/browse");
  });

  it("shows an error with Try again, and recovers", async () => {
    signIn();
    // The page retries a failed load once before showing the error.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json(page([item("a")])));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    // React Query waits about a second before its one retry.
    expect(
      await screen.findByRole(
        "heading",
        { name: "We couldn’t load your notifications" },
        { timeout: 4000 },
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("list", { name: "Your notifications" }),
    ).toBeInTheDocument();
  });

  it("asks to sign in again when the session has expired", async () => {
    signIn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "You’ve been signed out" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
      "href",
      "/?returnTo=%2Fnotifications",
    );
    expect(sessionStorage.getItem("foc.user-session")).toBeNull();
  });

  it("asks to sign in when nobody is signed in, without calling the API", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    expect(
      screen.getByRole("heading", { name: "You’ve been signed out" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks one read and tells the header badge", async () => {
    signIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(page([item("a")])))
      .mockResolvedValueOnce(
        json(item("a", { readAt: "2026-10-30T10:00:00Z" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const badgeRefresh = vi.fn();
    window.addEventListener("foc:notifications-changed", badgeRefresh);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Mark as read" }),
    );

    await waitFor(() =>
      expect(screen.queryByText("Unread")).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/notifications/me/a/read",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(badgeRefresh).toHaveBeenCalled();
    window.removeEventListener("foc:notifications-changed", badgeRefresh);
  });

  it("opening an errand marks it read first, then goes to the errand", async () => {
    signIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(page([item("a")])))
      .mockResolvedValueOnce(
        json(item("a", { readAt: "2026-10-30T10:00:00Z" })),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Open errand" }),
    );

    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith(`/errands/${orderId}`),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/me/a/read",
      expect.anything(),
    );
  });

  it("still opens the errand if marking it read fails", async () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(page([item("a")])))
        .mockResolvedValueOnce(json({}, 503)),
    );
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Open errand" }),
    );
    await waitFor(() =>
      expect(navigation.navigateTo).toHaveBeenCalledWith(`/errands/${orderId}`),
    );
  });

  it("has no errand link for account-level notifications", async () => {
    signIn();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(page([item("w", { type: "CREDITS_WELCOME", orderId: null })])),
        ),
    );
    renderPage();

    const list = await screen.findByRole("list", {
      name: "Your notifications",
    });
    expect(within(list).getByText("Credit activity")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open errand" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mark as read" }),
    ).toBeInTheDocument();
  });

  it("loads more pages on request", async () => {
    signIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(page([item("a")], 0, 2, 2)))
      .mockResolvedValueOnce(json(page([item("b")], 1, 2, 2)));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Load more" }),
    );

    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/notifications/me?page=1&size=20",
      expect.anything(),
    );
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});
