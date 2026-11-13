// uses localstorage to store gathered jwt tokens

const ACCESS_KEY = "auth.accessToken";
const REFRESH_KEY = "auth.refreshToken";

export interface Tokens {
    access: string;
    refresh: string;
}

type Listener = (tokens: Tokens | null) => void;
const listeners = new Set<Listener>();

function read(): Tokens | null {
    const access = localStorage.getItem(ACCESS_KEY);
    const refresh = localStorage.getItem(REFRESH_KEY);
    return access && refresh ? { access, refresh } : null;
}

let current: Tokens | null = read();

export function getTokens(): Tokens | null {
    return current;
}

export function getAccessToken(): string | null {
    return current?.access ?? null;
}

export function setTokens(tokens: Tokens): void {
    current = tokens;
    localStorage.setItem(ACCESS_KEY, tokens.access);
    localStorage.setItem(REFRESH_KEY, tokens.refresh);
    listeners.forEach(l => l(current));
}

export function clearTokens(): void {
    current = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    listeners.forEach(l => l(null));
}

export function onTokensChanged(listener: Listener): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}