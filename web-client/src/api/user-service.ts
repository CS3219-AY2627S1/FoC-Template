import { requestJson } from "./client";

export type SystemRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export type CurrentUser = {
  userId: string;
  username: string;
  email: string;
  displayName: string;
  systemRole: SystemRole;
  accountStatus: "ACTIVE" | "DELETED";
};

export type AccessSession = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
};

export type VerificationPending = {
  status: "verification_pending";
  email: string;
  expiresAt: string;
};

export type ActivatedAccount = {
  status: "active";
  userId: string;
  username: string;
  email: string;
  displayName: string;
  systemRole: "USER";
  emailVerifiedAt: string;
};

export type RegistrationPayload = {
  username: string;
  email: string;
  password: string;
  displayName?: string;
};

export type ProfileChanges = Pick<CurrentUser, "displayName">;

export type AdminUserAccount = {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  emailVerified: boolean;
  accountStatus: "ACTIVE" | "DELETED";
  systemRole: SystemRole;
  createdAt: string;
};

export type AdminLookupField = "username" | "email";

export type AdminAccountSummary = {
  userId: string;
  username: string;
  email: string;
  systemRole: "ADMIN" | "SUPER_ADMIN";
};

export type SystemRoleUpdate = {
  userId: string;
  systemRole: SystemRole;
  roleVersion: number;
};

export const userService = {
  startRegistration: (payload: RegistrationPayload) =>
    requestJson<VerificationPending>("/auth/registrations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  verifyEmail: (email: string, otp: string) =>
    requestJson<ActivatedAccount>("/auth/email-verifications", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),

  resendVerification: (email: string) =>
    requestJson<VerificationPending>("/auth/email-verifications/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  createSession: (email: string, password: string) =>
    requestJson<AccessSession>("/auth/sessions", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  refreshSession: () => requestJson<AccessSession>("/auth/sessions/refresh", { method: "POST" }),

  revokeCurrentSession: (accessToken: string) =>
    requestJson<void>("/auth/sessions/current", { method: "DELETE" }, accessToken),

  getCurrentUser: (accessToken: string) =>
    requestJson<CurrentUser>("/users/me", { method: "GET" }, accessToken),

  updateCurrentUser: (changes: ProfileChanges, accessToken: string) =>
    requestJson<CurrentUser>(
      "/users/me",
      { method: "PATCH", body: JSON.stringify(changes) },
      accessToken,
    ),

  changeCurrentPassword: (currentPassword: string, newPassword: string, accessToken: string) =>
    requestJson<void>(
      "/users/me/password",
      { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) },
      accessToken,
    ),

  deleteCurrentUser: (currentPassword: string, accessToken: string) =>
    requestJson<void>(
      "/users/me",
      { method: "DELETE", body: JSON.stringify({ currentPassword, acknowledgeDeletion: true }) },
      accessToken,
    ),

  listAdmins: (accessToken: string) =>
    requestJson<AdminAccountSummary[]>("/admin/admins", { method: "GET" }, accessToken),

  findUserAccount: (field: AdminLookupField, value: string, accessToken: string) => {
    const search = new URLSearchParams({ [field]: value });
    return requestJson<AdminUserAccount>(`/admin/users?${search.toString()}`, { method: "GET" }, accessToken);
  },

  updateUserSystemRole: (userId: string, systemRole: SystemRole, accessToken: string) =>
    requestJson<SystemRoleUpdate>(
      `/admin/users/${encodeURIComponent(userId)}/system-role`,
      { method: "PATCH", body: JSON.stringify({ systemRole }) },
      accessToken,
    ),
};
