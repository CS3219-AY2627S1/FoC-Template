// AI-assisted (OpenCode + Claude + Codex): typed fetch wrapper for the API gateway,
// attaches the JWT bearer token and normalizes error payloads. Extended with
// ordersApi and creditsApi for D3. Reviewed by authors.
import type { ChatAttachment, ChatConversation, ChatHistoryPage, WsTicket } from "./chat/types";
import type {
  AdminUser,
  AdminUserList,
  LoginResponse,
  Notification,
  NotificationList,
  ProfileResponse,
  RegisterResponse,
  Supplier,
  SupplierCreate,
  SupplierList,
  SupplierQuery,
  SupplierUpdate,
} from "./types";

export type { Notification, NotificationList };

declare global {
  interface Window {
    __FOC_ENV__?: { API_BASE_URL?: string };
  }
}

const BASE_URL =
  (typeof window !== "undefined" ? window.__FOC_ENV__?.API_BASE_URL : undefined) ??
  import.meta.env.VITE_API_BASE_URL ??
  "http://localhost:8080";

const TOKEN_KEY = "foc.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  // "blob" returns the raw response body (e.g. an image) instead of parsed JSON.
  responseType: "json" | "blob" = "json",
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // FormData sets its own multipart Content-Type (with the boundary).
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  if (extraHeaders) Object.assign(headers, extraHeaders);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;
  if (responseType === "blob" && res.ok) return (await res.blob()) as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const { message, code } = extractError(payload, res.status);
    throw new ApiError(res.status, message, code);
  }

  return payload as T;
}

function extractError(
  payload: unknown,
  status: number,
): { message: string; code?: string } {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    // Gateway style: { code, message }
    if (typeof obj.message === "string") {
      return { message: obj.message, code: obj.code as string | undefined };
    }
    // FastAPI style: { detail: string | [{ msg }] }
    const detail = obj.detail;
    if (typeof detail === "string") return { message: detail };
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as Record<string, unknown>;
      if (typeof first?.msg === "string") return { message: first.msg };
    }
  }
  if (typeof payload === "string" && payload) return { message: payload };
  return { message: `Request failed (${status})` };
}

function buildQuery(params: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const v of value) usp.append(key, String(v));
    } else {
      usp.append(key, String(value));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// ---- Auth / users ----
export const authApi = {
  register(body: {
    email: string;
    password: string;
    display_name: string;
    contact_number?: string | null;
  }) {
    return request<RegisterResponse>("POST", "/api/users/register", body);
  },
  verifyOtp(email: string, code: string) {
    return request<{ verified: boolean }>("POST", "/api/users/otp/verify", {
      email,
      code,
    });
  },
  resendOtp(email: string) {
    return request<unknown>("POST", "/api/users/otp/resend", { email });
  },
  login(email: string, password: string) {
    return request<LoginResponse>("POST", "/api/users/login", {
      email,
      password,
    });
  },
  forgotPassword(email: string) {
    return request<{ message: string }>("POST", "/api/users/password/forgot", {
      email,
    });
  },
  resetPassword(email: string, code: string, newPassword: string) {
    return request<{ message: string }>("POST", "/api/users/password/reset", {
      email,
      code,
      new_password: newPassword,
    });
  },
  me() {
    return request<ProfileResponse>("GET", "/api/users/me");
  },
  updateMe(body: {
    display_name?: string;
    contact_number?: string | null;
  }) {
    return request<ProfileResponse>("PATCH", "/api/users/me", body);
  },
};

// ---- Admin user management ----
export const adminUsersApi = {
  list(
    params: {
      limit?: number;
      offset?: number;
      q?: string;
      status?: "active" | "suspended";
    } = {},
  ) {
    const { limit = 50, offset = 0, q, status } = params;
    return request<AdminUserList>(
      "GET",
      `/api/users/admin${buildQuery({ limit, offset, q, status })}`,
    );
  },
  createAdmin(body: {
    email: string;
    password: string;
    display_name: string;
    contact_number?: string | null;
  }) {
    return request<AdminUser>("POST", "/api/users/admin", body);
  },
  suspend(userId: string) {
    return request<AdminUser>("POST", `/api/users/admin/${userId}/suspend`);
  },
  unsuspend(userId: string) {
    return request<AdminUser>("POST", `/api/users/admin/${userId}/unsuspend`);
  },
  updateRole(userId: string, role: "admin" | "client") {
    return request<AdminUser>("PATCH", `/api/users/admin/${userId}/role`, {
      role,
    });
  },
};

// ---- Suppliers ----
export const suppliersApi = {
  list(query: SupplierQuery = {}) {
    return request<SupplierList>(
      "GET",
      `/api/suppliers${buildQuery({
        category: query.category,
        zone: query.zone,
        q: query.q,
        page: query.page,
        page_size: query.pageSize,
        sort: query.sort,
        order: query.order,
        include_inactive: query.includeInactive,
      })}`,
    );
  },
  get(id: string) {
    return request<Supplier>("GET", `/api/suppliers/${id}`);
  },
  create(body: SupplierCreate) {
    return request<Supplier>("POST", "/api/suppliers", body);
  },
  update(id: string, body: SupplierUpdate) {
    return request<Supplier>("PATCH", `/api/suppliers/${id}`, body);
  },
  deactivate(id: string) {
    return request<Supplier>("POST", `/api/suppliers/${id}/deactivate`);
  },
  reactivate(id: string) {
    return request<Supplier>("POST", `/api/suppliers/${id}/reactivate`);
  },
};

// Backend timestamps are naive UTC (no trailing Z). Append Z so JS parses them
// as UTC rather than local time.
export function parseUtcDate(s: string): Date {
  return new Date(s.endsWith("Z") || s.includes("+") ? s : s + "Z");
}

// ---- Orders ----
export type OrderStatus =
  | "OPEN"
  | "ACCEPTED"
  | "PICKED_UP"
  | "AWAITING_APPROVAL"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED";

export interface OrderResponse {
  order_id: string;
  name: string;
  details: string;
  reward: number;
  deadline: string;
  supplier_id: string;
  requester_id: string;
  courier_id: string | null;
  pickup_location: string;
  delivery_location: string;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
  status: OrderStatus;
  created_at: string;
}

export interface OrderDetailResponse extends OrderResponse {
  supplier_name: string | null;
  requester_name: string | null;
  courier_name: string | null;
  proof_of_delivery_photo: string | null;
}

export interface OrderCreate {
  name: string;
  details: string;
  reward: number;
  deadline: string;
  supplier_id: string;
  pickup_location: string;
  delivery_location: string;
  delivery_latitude?: number | null;
  delivery_longitude?: number | null;
}

export type OrderUpdate = OrderCreate;

export interface OrderCancellationRequest {
  reason: string;
}

export interface OrderActionResponse {
  task_id: string;
  order_id: string;
  status: string;
  failure_reason: string | null;
}

export interface OrderTaskResult {
  task_id: string;
  order_id: string;
  status: string;
  failure_reason: string | null;
}

export const ordersApi = {
  list(
    params: {
      category?: string[];
      min_reward?: number;
      max_reward?: number;
      sort_by?: string;
      sort_order?: string;
    } = {},
  ) {
    return request<OrderResponse[]>(
      "GET",
      `/api/orders${buildQuery(params as Record<string, unknown>)}`,
    );
  },
  get(id: string) {
    return request<OrderDetailResponse>("GET", `/api/orders/${id}`);
  },
  create(body: OrderCreate) {
    return request<OrderResponse>("POST", "/api/orders", body);
  },
  update(id: string, body: OrderUpdate) {
    return request<OrderActionResponse>("PATCH", `/api/orders/${id}`, body);
  },
  delete(id: string) {
    return request<OrderActionResponse>("DELETE", `/api/orders/${id}`);
  },
  accept(id: string) {
    return request<OrderResponse>("POST", `/api/orders/${id}/accept`);
  },
  pickup(id: string) {
    return request<OrderResponse>("POST", `/api/orders/${id}/pickup`);
  },
  deliver(id: string, photo: File) {
    const body = new FormData();
    body.append("photo", photo);
    return request<OrderResponse>("POST", `/api/orders/${id}/deliver`, body);
  },
  withdraw(id: string) {
    return request<OrderResponse>(
      "POST",
      `/api/orders/${id}/withdraw`,
      undefined,
      { "Idempotency-Key": crypto.randomUUID() },
    );
  },
  approve(id: string) {
    return request<OrderActionResponse>("POST", `/api/orders/${id}/approve`);
  },
  cancel(id: string, body: OrderCancellationRequest) {
    return request<OrderActionResponse>(
      "POST",
      `/api/orders/${id}/cancel`,
      body,
    );
  },
  requestedOngoing() {
    return request<OrderResponse[]>("GET", "/api/orders/requested/ongoing");
  },
  requestedCompleted() {
    return request<OrderResponse[]>("GET", "/api/orders/requested/completed");
  },
  assignedActive() {
    return request<OrderResponse[]>("GET", "/api/orders/assigned");
  },
  assignedCompleted() {
    return request<OrderResponse[]>("GET", "/api/orders/assigned/completed");
  },
  pollUpdate(taskId: string) {
    return request<OrderActionResponse>(
      "GET",
      `/api/orders/updates/${taskId}`,
    );
  },
  pollDeletion(taskId: string) {
    return request<OrderActionResponse>(
      "GET",
      `/api/orders/deletions/${taskId}`,
    );
  },
};

// ---- Credits ----
export interface BalanceResponse {
  user_id: string;
  available_balance: number;
  reserved_balance: number;
}

export interface TransactionResponse {
  id: string;
  kind: string;
  amount: number;
  counterparty_user_id: string | null;
  reservation_id: string | null;
  order_id: string | null;
  created_at: string;
}

export const creditsApi = {
  getBalance(userId: string) {
    return request<BalanceResponse>("GET", `/api/credits/${userId}/balance`);
  },
  getTransactions(userId: string) {
    return request<TransactionResponse[]>(
      "GET",
      `/api/credits/${userId}/transactions`,
    );
  },
};

// ---- Notifications ----
export const notificationsApi = {
  list(
    userId: string,
    params: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
  ) {
    return request<NotificationList>(
      "GET",
      `/api/notifications/${userId}${buildQuery({
        unread_only: params.unreadOnly,
        limit: params.limit,
        offset: params.offset,
      })}`,
    );
  },
  markRead(userId: string, notificationId: string) {
    return request<{ status: string }>(
      "POST",
      `/api/notifications/${userId}/${notificationId}/read`,
    );
  },
  markAllRead(userId: string) {
    return request<{ marked_read: number; unread_count: number }>(
      "POST",
      `/api/notifications/${userId}/read-all`,
    );
  },
};

// ---- Chat (chat-service via the gateway) ----
export function wsBaseUrl(): string {
  const base = BASE_URL || window.location.origin;
  return base.replace(/^http/, "ws").replace(/\/$/, "");
}

export const chatApi = {
  /** One-time ticket for opening the chat WebSocket (valid for ~30 s). */
  ticket() {
    return request<WsTicket>("POST", "/api/chat/ws-ticket");
  },
  inbox() {
    return request<ChatConversation[]>("GET", "/api/chat/conversations");
  },
  conversation(id: string) {
    return request<ChatConversation>("GET", `/api/chat/conversations/${id}`);
  },
  history(
    id: string,
    params: { before_seq?: number; after_seq?: number; limit?: number } = {},
  ) {
    return request<ChatHistoryPage>(
      "GET",
      `/api/chat/conversations/${id}/messages${buildQuery(params)}`,
    );
  },
  /** Upload a photo to a chat; then send it as {kind: "image", payload: {attachment_id}}. */
  uploadPhoto(id: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return request<ChatAttachment>("POST", `/api/chat/conversations/${id}/attachments`, form);
  },
  /** A photo's bytes. Fetched with the login token; <img> tags cannot send it. */
  photo(id: string, attachmentId: string) {
    return request<Blob>(
      "GET",
      `/api/chat/conversations/${id}/attachments/${attachmentId}`,
      undefined,
      undefined,
      "blob",
    );
  },
};
