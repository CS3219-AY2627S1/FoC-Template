import { describe, expect, it } from "vitest";
import {
  passwordFormatError,
  validatePasswordChange,
  validateRegistration,
} from "../../src/api/validation";

const baseRegistration = {
  username: "CampusUser",
  displayName: "CampusUser",
  email: "campus@u.nus.edu",
  passwordConfirmation: "Secure.Pass1",
};

describe("registration password validation", () => {
  it("accepts a full stop as an allowed special character", () => {
    expect(
      validateRegistration({ ...baseRegistration, password: "Secure.Pass1" }),
    ).not.toHaveProperty("password");
  });

  it("uses the requested requirements error for any password-format failure", () => {
    expect(
      validateRegistration({ ...baseRegistration, password: "onlylowercasepassword", passwordConfirmation: "onlylowercasepassword" }),
    ).toMatchObject({ password: passwordFormatError });
  });
});

describe("password change validation", () => {
  it("requires a different, confirmed replacement password", () => {
    expect(
      validatePasswordChange({
        currentPassword: "CurrentPass1!",
        newPassword: "CurrentPass1!",
        passwordConfirmation: "CurrentPass1!",
      }),
    ).toMatchObject({ newPassword: "Choose a password that is different from the current password." });

    expect(
      validatePasswordChange({
        currentPassword: "CurrentPass1!",
        newPassword: "ReplacementPass1!",
        passwordConfirmation: "DifferentPass1!",
      }),
    ).toMatchObject({ passwordConfirmation: "Passwords do not match." });
  });
});
