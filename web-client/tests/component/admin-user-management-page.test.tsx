import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAccountSummary, AdminUserAccount } from "../../src/api/user-service";
import { AdminUserManagementPage } from "../../src/pages/admin-user-management-page";

const auth = vi.hoisted(() => ({
  user: { userId: "self", username: "SuperSelf", email: "self@u.nus.edu", displayName: "Self", systemRole: "SUPER_ADMIN", accountStatus: "ACTIVE" },
  findUserAccount: vi.fn(),
  listAdmins: vi.fn(),
  updateUserSystemRole: vi.fn(),
}));

vi.mock("../../src/app/use-auth", () => ({ useAuth: () => auth }));

const initialAdmins: AdminAccountSummary[] = [
  { userId: "self", username: "SuperSelf", email: "self@u.nus.edu", systemRole: "SUPER_ADMIN" },
  { userId: "admin", username: "CampusAdmin", email: "admin@u.nus.edu", systemRole: "ADMIN" },
];

const searchedAccount: AdminUserAccount = {
  userId: "new-user", username: "NewAdmin", email: "new@u.nus.edu", displayName: "NewAccount",
  systemRole: "USER", accountStatus: "ACTIVE", emailVerified: true, createdAt: "2026-10-01T00:00:00Z",
};

async function renderPage() {
  await act(async () => { render(<MemoryRouter initialEntries={["/admin/users"]}><AdminUserManagementPage /></MemoryRouter>); });
}

function currentAdmins() {
  return screen.getByRole("region", { name: "Current super admins / admins" });
}

async function searchAccount(account = searchedAccount) {
  auth.findUserAccount.mockResolvedValue(account);
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: account.username } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Search account" }));
  });
  return (await screen.findByRole("heading", { name: account.displayName })).closest("section")!;
}

async function reviewChange(container: HTMLElement, role: string) {
  fireEvent.change(within(container).getByLabelText("Change access level"), { target: { value: role } });
  const reviewButton = within(container).getByRole("button", { name: "Review role change" });
  expect(reviewButton).toBeEnabled();
  fireEvent.click(reviewButton);
  const confirmation = await within(container).findByRole("dialog");
  expect(confirmation).toBeVisible();
  return confirmation;
}

describe("Manage admins", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    auth.listAdmins.mockResolvedValue(initialAdmins);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the exact copy, limited list fields, and a read-only self row", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "Manage admins" })).toBeVisible();
    expect(screen.getByText("Find any FoC account by its unique username or NUS email address and change their role in FoC")).toBeVisible();
    expect(screen.getByRole("link", { name: "Manage admins" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Admin mode" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "Manage suppliers" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    await screen.findByRole("listitem", { name: "CampusAdmin" });
    const roster = within(currentAdmins());
    expect(roster.getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual(["SuperSelf", "CampusAdmin"]);
    expect(roster.getByText("admin@u.nus.edu")).toBeVisible();
    expect(roster.queryByText("User ID")).not.toBeInTheDocument();
    expect(roster.queryByText("Registered")).not.toBeInTheDocument();
    expect(within(roster.getByRole("listitem", { name: "SuperSelf" })).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(roster.getByRole("listitem", { name: "CampusAdmin" })).getByRole("combobox")).toBeVisible();
  });

  it("handles loading, list failure, retry, and empty state independently of search", async () => {
    let rejectList!: (error: Error) => void;
    auth.listAdmins.mockReturnValueOnce(new Promise((_, reject) => { rejectList = reject; })).mockResolvedValueOnce([]);
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent("Loading current admins");
    await searchAccount();
    rejectList(new Error("unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the current admins");
    fireEvent.click(screen.getByRole("button", { name: "Retry loading admins" }));
    expect(await screen.findByText("No current super admins or admins found.")).toBeVisible();
    expect(screen.getByRole("heading", { name: "NewAccount" })).toBeVisible();
  });

  it("promotes a search result and adds it to the refreshed list after confirmation", async () => {
    auth.listAdmins.mockResolvedValueOnce(initialAdmins).mockResolvedValueOnce([
      ...initialAdmins, { ...searchedAccount, systemRole: "ADMIN" },
    ]);
    auth.updateUserSystemRole.mockResolvedValue({ userId: "new-user", systemRole: "ADMIN", roleVersion: 2 });
    await renderPage();
    await screen.findByRole("listitem", { name: "CampusAdmin" });
    const result = await searchAccount();
    const confirmation = await reviewChange(result, "ADMIN");
    expect(auth.updateUserSystemRole).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    expect(await screen.findByRole("listitem", { name: "NewAdmin" })).toBeVisible();
    await waitFor(() => expect(auth.listAdmins).toHaveBeenCalledTimes(2));
    expect(auth.updateUserSystemRole).toHaveBeenCalledWith("new-user", "ADMIN");
    expect(within(result).getByText("Admin", { selector: "dd" })).toBeVisible();
  });

  it("reorders a promoted list row and synchronizes a matching search result", async () => {
    auth.listAdmins.mockResolvedValueOnce(initialAdmins).mockResolvedValueOnce([
      { ...initialAdmins[1], systemRole: "SUPER_ADMIN" }, initialAdmins[0],
    ]);
    auth.updateUserSystemRole.mockResolvedValue({ userId: "admin", systemRole: "SUPER_ADMIN", roleVersion: 2 });
    await renderPage();
    const row = await screen.findByRole("listitem", { name: "CampusAdmin" });
    const result = await searchAccount({ ...searchedAccount, ...initialAdmins[1], displayName: "FoundAdmin" });
    const confirmation = await reviewChange(row, "SUPER_ADMIN");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    await waitFor(() => expect(auth.listAdmins).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(within(currentAdmins()).getAllByRole("listitem")[0]).toHaveAttribute("aria-label", "CampusAdmin"));
    expect(within(result).getByText("Super Admin", { selector: "dd" })).toBeVisible();
  });

  it("removes a list row when demoted to User", async () => {
    auth.listAdmins.mockResolvedValueOnce(initialAdmins).mockResolvedValueOnce([initialAdmins[0]]);
    auth.updateUserSystemRole.mockResolvedValue({ userId: "admin", systemRole: "USER", roleVersion: 2 });
    await renderPage();
    const row = await screen.findByRole("listitem", { name: "CampusAdmin" });
    const confirmation = await reviewChange(row, "USER");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    await waitFor(() => expect(screen.queryByRole("listitem", { name: "CampusAdmin" })).not.toBeInTheDocument());
    expect(auth.updateUserSystemRole).toHaveBeenCalledWith("admin", "USER");
    await waitFor(() => expect(auth.listAdmins).toHaveBeenCalledTimes(2));
  });

  it("reports a refresh failure separately from a successful role change and supports retry", async () => {
    auth.listAdmins.mockResolvedValueOnce(initialAdmins).mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce([{ ...initialAdmins[1], systemRole: "SUPER_ADMIN" }, initialAdmins[0]]);
    auth.updateUserSystemRole.mockResolvedValue({ userId: "admin", systemRole: "SUPER_ADMIN", roleVersion: 2 });
    await renderPage();
    const row = await screen.findByRole("listitem", { name: "CampusAdmin" });
    const confirmation = await reviewChange(row, "SUPER_ADMIN");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the current admins");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(within(row).getByRole("status")).toHaveTextContent("access level is now Super Admin");
    expect(within(row).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading admins" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(auth.updateUserSystemRole).toHaveBeenCalledTimes(1);
  });

  it("leaves the row and confirmation intact when the role mutation fails", async () => {
    auth.updateUserSystemRole.mockRejectedValue(new Error("unavailable"));
    await renderPage();
    const row = await screen.findByRole("listitem", { name: "CampusAdmin" });
    const confirmation = await reviewChange(row, "USER");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not change this account's access level");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("listitem", { name: "CampusAdmin" })).toBeVisible();
    expect(auth.listAdmins).toHaveBeenCalledTimes(1);
  });

  it("ignores an earlier list response after a role change refresh has completed", async () => {
    let resolveInitial!: (admins: AdminAccountSummary[]) => void;
    auth.listAdmins.mockReturnValueOnce(new Promise((resolve) => { resolveInitial = resolve; }))
      .mockResolvedValueOnce([...initialAdmins, { ...searchedAccount, systemRole: "ADMIN" }]);
    auth.updateUserSystemRole.mockResolvedValue({ userId: "new-user", systemRole: "ADMIN", roleVersion: 2 });
    await renderPage();
    const result = await searchAccount();
    const confirmation = await reviewChange(result, "ADMIN");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Change access level" }));
    await screen.findByRole("listitem", { name: "NewAdmin" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await act(async () => { resolveInitial(initialAdmins); });
    expect(screen.getByRole("listitem", { name: "NewAdmin" })).toBeVisible();
  });
});
