import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import * as TokenStore from '@/auth/tokenStorage';
import { useAlertStore } from '@/stores/alerts';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export interface GeneralApiError {
    message: string,
    [k: string]: any,
}

export class ApiError extends Error {
    status?: number;
    context?: GeneralApiError;

	constructor(status?: number, context?: GeneralApiError, message?: string) {
		super(message ?? `request failed (${status})`)
        this.status = status;
        this.context = context;
	}
}

export async function tryRefreshToken() {
	const tokens = TokenStore.getTokens()
	if (!tokens)
        throw new Error("no tokens available to refresh");

    const client = axios.create({ baseURL: BASE_URL });

    try {
        const res = await client.post("/public/user/auth/refresh", {
            refreshToken: tokens.refresh
        });
        const { accessToken, refreshToken } = res.data;
        TokenStore.setTokens({
            access: accessToken,
            refresh: refreshToken
        });
        return accessToken;
    } catch (e) {
        if (axios.isAxiosError(e)) {
            console.warn("token refresh failed, clearing login tokens");
            TokenStore.clearTokens();
            const isSuspended = e.response?.status === 403;
            if (isSuspended)
                useAlertStore().error(e.response?.data?.error ?? "Your account has been suspended.");
            throw new ApiError(e.response?.status, e.response?.data, isSuspended ? "Your account has been suspended." : "token refresh failed");
        }
        throw e;
    }
}

// all reqs share the same refresh request to prevent dos
let refreshLock: Promise<string> | null = null;
export function refreshOnce(): Promise<string> {
	if (!refreshLock) {
		refreshLock = tryRefreshToken().finally(() => {
			refreshLock = null;
		})
	}
	return refreshLock;
}

export const createClient = (baseUrl: string) => {
    const client = axios.create({ baseURL: baseUrl });
    
    client.interceptors.request.use(config => {
        const token = TokenStore.getAccessToken();
        if (token && !config?.shouldSkipAuthHeader)
            config.headers.Authorization = `Bearer ${token}`;
        return config;
    });
    
    client.interceptors.response.use(
        r => r,
        async (error: AxiosError) => {
            const config = error.config as InternalAxiosRequestConfig & { retryFlag?: boolean };
            const status = error.response?.status;
    
            if (status !== 401 || config.shouldSkipAuthHeader || config.retryFlag) {
                throw error;
            }
    
            // flag marked to allow refreshing maximum once, avoid flooding the endpoint
            config.retryFlag = true;
            const newToken = await refreshOnce();
            config.headers.Authorization = `Bearer ${newToken}`;
            return client(config);
        },
    );
    return client;
};

export default createClient(BASE_URL);
