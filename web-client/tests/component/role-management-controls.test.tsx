import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../src/api/client";
import { canManageSystemRole } from "../../src/app/role-access";
import { RoleManagementControls } from "../../src/components/role-management-controls";

describe("RoleManagementControls", () => {
  afterEach(cleanup);

  it("allows only a Super Admin to act on another account", () => {
    expect(canManageSystemRole("ADMIN", "admin-1", "user-1")).toBe(false);
    expect(canManageSystemRole("SUPER_ADMIN", "super-admin-1", "super-admin-1")).toBe(false);
    expect(canManageSystemRole("SUPER_ADMIN", "super-admin-1", "user-1")).toBe(true);
  });

  it("keeps Administrators view-only", () => {
    render(
      <RoleManagementControls
        accountName="Campus Helper"
        canManage={false}
        currentRole="USER"
        onChangeRole={async () => undefined}
      />,
    );

    expect(screen.queryByRole("button", { name: "Review role change" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Change access level")).not.toBeInTheDocument();
  });

  it("requires confirmation before sending a Super Admin role change and reports success", async () => {
    const onChangeRole = vi.fn().mockResolvedValue(undefined);
    render(
      <RoleManagementControls
        accountName="Campus Helper"
        canManage
        currentRole="USER"
        onChangeRole={onChangeRole}
      />,
    );

    fireEvent.change(screen.getByLabelText("Change access level"), { target: { value: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Review role change" }));

    const confirmation = screen.getByRole("dialog", { name: "Change Campus Helper’s role?" });
    expect(confirmation).toBeVisible();
    expect(confirmation).toHaveTextContent("Change this account from User to Admin.");
    expect(onChangeRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Change access level" }));

    await waitFor(() => expect(onChangeRole).toHaveBeenCalledWith("ADMIN"));
    expect(screen.getByRole("status")).toHaveTextContent("Campus Helper's access level is now Admin.");
  });

  it("keeps an actionable server lifecycle failure visible in the confirmation", async () => {
    const onChangeRole = vi.fn().mockRejectedValue(
      new ApiRequestError(409, "At least one active Super Admin must remain.", {
        code: "LAST_SUPER_ADMIN_REQUIRED",
      }),
    );
    render(
      <RoleManagementControls
        accountName="Campus Helper"
        canManage
        currentRole="SUPER_ADMIN"
        onChangeRole={onChangeRole}
      />,
    );

    fireEvent.change(screen.getByLabelText("Change access level"), { target: { value: "ADMIN" } });
    fireEvent.click(screen.getByRole("button", { name: "Review role change" }));
    fireEvent.click(screen.getByRole("button", { name: "Change access level" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("At least one active Super Admin must remain.");
    expect(screen.getByRole("dialog", { name: "Change Campus Helper’s role?" })).toBeVisible();
  });
});
