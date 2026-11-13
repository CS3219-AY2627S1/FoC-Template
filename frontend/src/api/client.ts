const API_BASE_URL = import.meta.env.VITE_API_GATEWAY_URL || "https://d3414od56848h5.cloudfront.net/api";

const ACCESS_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string, refreshToken?: string) {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  } catch {
    //ignore 
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function executeRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearToken();
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearToken();
      return null;
    }

    const data = await response.json();
    if (data.accessToken) {
      setTokens(data.accessToken, data.refreshToken);
      return data.accessToken;
    }

    clearToken();
    return null;
  } catch {
    clearToken();
    return null;
  } finally {
    refreshPromise = null;
  }
}

export async function request(
  endpointOrUrl: string,
  init: RequestInit = {},
  authenticated = true
): Promise<Response> {
  const isFullUrl = endpointOrUrl.startsWith("http://") || endpointOrUrl.startsWith("https://");
  const url = isFullUrl
    ? endpointOrUrl
    : `${API_BASE_URL}${endpointOrUrl.startsWith("/") ? "" : "/"}${endpointOrUrl}`;

  const currentToken = authenticated ? getToken() : null;

  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
    ...((init.headers as Record<string, string>) || {}),
  };

  // Avoid CloudFront/browser serving a stale GET after supplier image updates.
  const fetchInit: RequestInit = {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  };

  let response = await fetch(url, fetchInit);

  if (response.status === 401 && authenticated && !url.includes("/auth/refresh")) {
    if (!refreshPromise) {
      refreshPromise = executeRefresh();
    }

    const newAccessToken = await refreshPromise;

    if (newAccessToken) {
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newAccessToken}`,
      };

      response = await fetch(url, {
        ...fetchInit,
        headers: retryHeaders,
      });
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const details = Array.isArray(errorBody?.errors)
      ? errorBody.errors.filter((item: unknown) => typeof item === "string").join(" ")
      : "";
    const message = errorBody?.message ?? `Request failed: ${response.status}`;
    const fullMessage = details ? `${message}: ${details}` : message;

    if (response.status === 401 && authenticated) {
      clearToken();
      throw new UnauthorizedError(fullMessage);
    }
    if (response.status === 403) {
      throw new ForbiddenError(fullMessage);
    }
    if (response.status === 404) {
      throw new NotFoundError(fullMessage);
    }

    throw new ApiError(response.status, fullMessage);
  }

  return response;
}
