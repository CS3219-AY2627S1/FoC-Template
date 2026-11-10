export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegistrationChallenge {
    challengeId: string;
    expiresAt: string;
}

export type ResendRegistrationOtpPayload = Pick<RegistrationChallenge, "challengeId">;

export interface PendingRegistrationChallenge extends RegistrationChallenge {
    email: string;
}

export interface VerifyRegistrationResult {
    user: ApiUser;
}

export interface AdminActivationResult {
    user: ApiUser;
}

export interface ApiUser {
    id: string;
    email: string;
    username: string;
    phoneNumber: string;
    role: Role;
}

// Login response from server
export interface AuthResult {
    user: ApiUser;
    accessToken: string;
}

export const ROLES = {
    STUDENT: "STUDENT",
    ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
