import { AppError } from "./errors";
import { isUuid } from "./integration-access";

export type ReportInput = { reporterUserId: string; reportedUserId: string; comment: string };
export type AppealInput = { userId: string; message: string };
export type ReportRecord = { id: string; reporterUserId: string; reportedUserId: string; comment: string;
  status: "open" | "dismissed" | "actioned"; createdAt: string; closedAt: string | null; closedByAdminId: string | null };
export type AppealRecord = { id: string; userId: string; message: string; status: "open" | "rejected" | "reinstated";
  rejectionReason: string | null; createdAt: string; closedAt: string | null; closedByAdminId: string | null };
export interface AdminIntake {
  report(input: ReportInput): Promise<ReportRecord>;
  appeal(input: AppealInput): Promise<AppealRecord>;
  latestAppeal(userId: string): Promise<AppealRecord | null>;
}

const invalidResponse = () => new AppError(502, "ADMIN_INVALID_RESPONSE", "Admin Service returned an invalid response");
const isText = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const isDate = (value: unknown) => typeof value === "string" && !Number.isNaN(Date.parse(value));

async function readAdminJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw invalidResponse();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 32_768) { await reader.cancel(); throw invalidResponse(); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw invalidResponse(); }
}

function storedRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidResponse();
  const row = value as Record<string, unknown>;
  if (!isUuid(row.id) || !isDate(row.createdAt) || (row.closedAt !== null && !isDate(row.closedAt))
    || (row.closedByAdminId !== null && !isText(row.closedByAdminId, 200))) throw invalidResponse();
  return row;
}

function appealRecord(row: Record<string, unknown>, userId: string): AppealRecord {
  if (row.userId !== userId || !isText(row.message, 4000)
    || typeof row.status !== "string" || !["open", "rejected", "reinstated"].includes(row.status)
    || (row.rejectionReason !== null && (!isText(row.rejectionReason, 4000) || !(row.rejectionReason as string).trim()))) throw invalidResponse();
  return { id: row.id, userId: row.userId, message: row.message, status: row.status, rejectionReason: row.rejectionReason,
    createdAt: row.createdAt, closedAt: row.closedAt, closedByAdminId: row.closedByAdminId } as AppealRecord;
}

export function validateAdminBaseUrl(value: string): string {
  if (!value) return ""; // Other account operations remain usable when Admin is not configured.
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    return url.origin;
  } catch {
    throw new Error("ADMIN_SERVICE_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment");
  }
}

export class HttpAdminIntake implements AdminIntake {
  private readonly origin: string;
  constructor(baseUrl: string, private readonly timeoutMs = 5000, private readonly send: typeof fetch = fetch) {
    this.origin = validateAdminBaseUrl(baseUrl);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error("Invalid Admin request timeout");
  }

  private async post(path: string, payload: ReportInput | AppealInput): Promise<Record<string, unknown>> {
    if (!this.origin) throw new AppError(503, "ADMIN_NOT_CONFIGURED", "Account support is not configured");
    try {
      const response = await this.send(new URL(path, this.origin), {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(this.timeoutMs),
        headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload),
      });
      if (response.status !== 201) {
        await response.body?.cancel();
        if (response.status === 409) throw new AppError(409, "ADMIN_CONFLICT", "An account support request conflicts with an existing request");
        if (response.status >= 500 || response.status === 429) throw new AppError(503, "ADMIN_UNAVAILABLE", "Account support is temporarily unavailable");
        throw new AppError(502, "ADMIN_REQUEST_REJECTED", "Admin Service rejected the support request");
      }
      return storedRecord(await readAdminJson(response));
    } catch (error) {
      if (error instanceof AppError) throw error;
      // Do not log or return raw upstream errors, URLs, comments or credentials.
      throw new AppError(503, "ADMIN_UNAVAILABLE", "Account support is temporarily unavailable");
    }
  }

  async report(input: ReportInput): Promise<ReportRecord> {
    const row = await this.post("/api/v1/admin/internal/reports", input);
    if (row.reporterUserId !== input.reporterUserId || row.reportedUserId !== input.reportedUserId
      || !isText(row.comment, 4000) || typeof row.status !== "string" || !["open", "dismissed", "actioned"].includes(row.status)) throw invalidResponse();
    // Keep Admin's stored text on idempotent retries, but don't forward unknown fields.
    return { id: row.id, reporterUserId: row.reporterUserId, reportedUserId: row.reportedUserId,
      comment: row.comment, status: row.status, createdAt: row.createdAt, closedAt: row.closedAt,
      closedByAdminId: row.closedByAdminId } as ReportRecord;
  }

  async appeal(input: AppealInput): Promise<AppealRecord> {
    const row = await this.post("/api/v1/admin/internal/appeals", input);
    return appealRecord(row, input.userId);
  }

  async latestAppeal(userId: string): Promise<AppealRecord | null> {
    if (!isUuid(userId)) throw invalidResponse();
    if (!this.origin) throw new AppError(503, "ADMIN_NOT_CONFIGURED", "Account support is not configured");
    const url = new URL("/api/v1/admin/appeals/latest", this.origin);
    url.searchParams.set("userId", userId);
    try {
      const response = await this.send(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: "application/json" } });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new AppError(503, "ADMIN_UNAVAILABLE", "Account support is temporarily unavailable");
      }
      const value = await readAdminJson(response);
      return value === null ? null : appealRecord(storedRecord(value), userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, "ADMIN_UNAVAILABLE", "Account support is temporarily unavailable");
    }
  }
}
