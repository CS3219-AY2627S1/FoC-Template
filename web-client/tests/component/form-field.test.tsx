import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "../../src/components/form-field";
import { PasswordRequirements } from "../../src/components/password-requirements";
import { ChangePasswordDialog } from "../../src/components/change-password-dialog";

describe("FormField", () => {
  it("connects validation feedback to its field", () => {
    render(<FormField id="display-name" label="Display name" error="Use at least two characters" />);

    expect(screen.getByLabelText("Display name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Use at least two characters");
  });

  it("renders the exact password character groups in the hover tooltip", () => {
    render(<PasswordRequirements>At least 12 characters from 3 of the 4 character groups</PasswordRequirements>);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Uppercase letters (A–Z)");
    expect(tooltip).toHaveTextContent("Lowercase letters (a–z)");
    expect(tooltip).toHaveTextContent("Digits (0–9)");
    expect(tooltip).toHaveTextContent("Special characters (!, #, $, %, ^, &, *, (, ), -, _, =, +,?,.)");
  });

  it("explains the sign-out effect in the password-change dialog", () => {
    render(
      <ChangePasswordDialog
        busy={false}
        currentPassword=""
        errors={{}}
        newPassword=""
        onCancel={() => undefined}
        onConfirm={() => undefined}
        onCurrentPasswordChange={() => undefined}
        onNewPasswordChange={() => undefined}
        onPasswordConfirmationChange={() => undefined}
        open
        passwordConfirmation=""
      />,
    );

    expect(screen.getByRole("dialog", { name: "Change password" })).toBeVisible();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toBeVisible();
    expect(screen.getByText("You will be signed out on every device after changing your password.")).toBeVisible();
  });
});
