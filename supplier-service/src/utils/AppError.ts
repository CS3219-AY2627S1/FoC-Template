/*
 * AI Assistance Disclosure:
 * Tool: Codex (model: gpt-5.6-luna), date: 2026-09-28
 * Scope: Generated Phase0 Task5 AppError and detail types.
 *        No requirements, architecture, schema, or API decisions were made by the AI tool.
 * Author review: Congchen
 */
export interface AppErrorDetail {
  field: string;
  location: string;
  message: string;
}

export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: AppErrorDetail[];
  retryAfterSeconds?: number;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    options?: { details?: AppErrorDetail[]; retryAfterSeconds?: number },
  ) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
    if (options?.details !== undefined) this.details = options.details;
    if (options?.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
