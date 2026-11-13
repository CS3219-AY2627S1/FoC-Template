import client from "./http";

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
}

export async function acceptInviteCode(code: string) {
    const res = await client.post(
        "/public/user/auth/accept-invite",
        { code },
        { shouldSkipAuthHeader: false }
    );
    return res.data as LoginResponse;
}

export async function login(email: string, password: string) {
    const res = await client.post(
        "/public/user/auth/login",
        { email, password },
        { shouldSkipAuthHeader: true }
    );
    return res.data as LoginResponse;
}

export async function register(email: string, password: string) {
    await client.post(
        "/public/user/auth/register",
        { email, password },
        { shouldSkipAuthHeader: true }
    );
}