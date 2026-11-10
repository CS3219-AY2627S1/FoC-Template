import type { APIRequest, APIService, EndpointConfigEntry } from './models';
import { CampusErrandsAPIError } from './models';
import { routes } from '../routes';
import { consumeOrderCreateResponseLoss } from './orderDemo';

const apiUrls: Record<APIService, string> = {
    supplier: import.meta.env.VITE_SUPPLIER_API_URL || '/supplier-api',
    user: import.meta.env.VITE_USER_API_URL || '/user-api',
    order: import.meta.env.VITE_ORDER_API_URL || '/order-api',
    credit: import.meta.env.VITE_CREDIT_API_URL || '/credit-api',
};
const PUBLIC_ROUTES = new Set<string>([routes.signIn]);
type RequestDetails = {
    init: RequestInit;
    url: string;
};

export type AuthenticatedRequestOptions = {
    onUnauthenticated?: () => void;
    headers?: Record<string, string>;
};

const appendQueryValue = (query: URLSearchParams, field: string, value: unknown): void => {
    if (!Array.isArray(value)) {
        query.append(field, String(value));
        return;
    }

    if (value.length === 0) {
        query.append(field, '');
        return;
    }

    value.forEach((item) => query.append(field, String(item)));
};

const buildRequest = (request: APIRequest, config: EndpointConfigEntry): RequestDetails => {
    let url = `${apiUrls[config.service].replace(/\/$/, '')}/${config.url.replace(/^\//, '')}`;
    const body: Record<string, unknown> = {};
    const query = new URLSearchParams();
    let formData: FormData | undefined;

    Object.entries(request ?? {}).forEach(([field, value]) => {
        if (value === undefined) return;
        const fieldType = config.fieldMap?.[field];

        if (fieldType === 'path') {
            url = url.replace(`:${field}`, encodeURIComponent(String(value)));
        } else if (fieldType === 'query' || (config.verb === 'GET' && !fieldType)) {
            appendQueryValue(query, field, value);
        } else if (fieldType === 'formData') {
            formData ??= new FormData();
            formData.append(field, value instanceof Blob ? value : String(value));
        } else {
            body[field] = value;
        }
    });

    const queryString = query.toString();
    if (queryString) {
        url += `${url.includes('?') ? '&' : '?'}${queryString}`;
    }

    const headers: Record<string, string> = {};
    const init: RequestInit = { method: config.verb, credentials: 'include', headers };
    if (config.keepalive) {
        init.keepalive = true;
    }
    if (formData) {
        init.body = formData;
    } else if (Object.keys(body).length > 0) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
    }

    return { init, url };
};

const parseResponse = async <T>(response: Response): Promise<T> => {
    if (response.status === 204) {
        return null as T;
    }

    const contentType = response.headers?.get('content-type');
    if (!contentType) {
        return null as T;
    }
    if (contentType.includes('application/json')) {
        return (await response.json()) as T;
    }
    return (await response.text()) as T;
};

const getErrorMessage = (data: unknown, fallback: string): string => {
    // Proxy error pages and plain-text diagnostics are not user-facing messages.
    const safeMessage = (value: unknown): value is string =>
        typeof value === 'string' && value.trim().length > 0 &&
        value.length <= 300 && !/[<>]/.test(value);
    if (typeof data === 'string') {
        return fallback;
    }
    if (!data || typeof data !== 'object') {
        return fallback;
    }

    const errorBody = data as { detail?: unknown; message?: unknown };
    if (safeMessage(errorBody.message)) {
        return errorBody.message;
    }
    if (safeMessage(errorBody.detail)) {
        return errorBody.detail;
    }

    return fallback;
};

const serviceNames: Record<APIService, string> = {
    user: 'Account', supplier: 'Supplier', order: 'Order', credit: 'Credit',
};

const sendRequest = async <TResponse>({ init, url }: RequestDetails, service: APIService): Promise<TResponse> => {
    const unavailable = `${serviceNames[service]} services are temporarily unavailable. Please try again shortly.`;
    let response: Response;
    try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
    } catch {
        throw new CampusErrandsAPIError(unavailable, 0);
    }
    let data: TResponse | null;
    const requestId = response.headers?.get('x-request-id') ?? undefined;
    try {
        data = await parseResponse<TResponse>(response);
    } catch {
        // Preserve HTTP status (especially 401) even if the error body is invalid.
        if (response.ok) throw new CampusErrandsAPIError(unavailable, 502, undefined, requestId);
        data = null;
    }
    const contentType = response.headers?.get('content-type') ?? '';

    if (
        response.ok &&
        contentType.includes('text/html') &&
        typeof data === 'string' &&
        /<!doctype html|<html[\s>]/i.test(data)
    ) {
        throw new CampusErrandsAPIError(unavailable, 502, undefined, requestId);
    }

    if (!response.ok) {
        const fallback = response.status === 401 ? 'Please sign in again to continue.'
            : response.status === 403 ? 'You do not have permission to do that.'
            : response.status === 429 ? 'Too many attempts. Please wait a moment and try again.'
            : 'We couldn’t complete that request. Please try again.';
        const message = response.status >= 500 ? unavailable : getErrorMessage(data, fallback);
        throw new CampusErrandsAPIError(message, response.status, data, requestId);
    }

    return data as TResponse;
};

export const makeCampusErrandsAPIRequest = async <TRequest extends APIRequest, TResponse>(
    request: TRequest,
    config: EndpointConfigEntry,
    headers: Record<string, string> = {}
): Promise<TResponse> => {
    const details = buildRequest(request, config);
    details.init.headers = { ...details.init.headers, ...headers };
    const response = await sendRequest<TResponse>(details, config.service);
    if (consumeOrderCreateResponseLoss(config)) {
        // The real successful response was consumed, but the caller sees a lost receipt.
        throw new CampusErrandsAPIError('Order receipt was lost. Retrying is safe with the same idempotency key.', 0);
    }
    return response;
};

const redirectToSignIn = (): void => {
    if (!PUBLIC_ROUTES.has(window.location.pathname)) {
        window.location.replace(routes.signIn);
    }
};

export const makeAuthenticatedCampusErrandsAPIRequest = async <TRequest extends APIRequest, TResponse>(
    request: TRequest,
    config: EndpointConfigEntry,
    options: AuthenticatedRequestOptions = {}
): Promise<TResponse> => {
    try {
        return await makeCampusErrandsAPIRequest<TRequest, TResponse>(request, config, options.headers);
    } catch (error) {
        if (error instanceof CampusErrandsAPIError && error.status === 401) {
            (options.onUnauthenticated ?? redirectToSignIn)();
        }
        throw error;
    }
};
