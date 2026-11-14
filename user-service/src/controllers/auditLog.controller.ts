// AI Assistance Disclosure:
// Tool: Claude Code (model: claude-sonnet-5), date: 2026-11-06
// Scope: Stage 26d - GET /admin/audit-logs: Zod .strict() validation of req.query per
//        instructions.md's "Viewing the log" decisions table (pagination follows Stage 15b).
//        No requirements, architecture, schema, or API decisions were made by the AI tool.
// Author review:

import { z } from "zod";
import { ALL_REASON_CODES, AUDIT_ACTIONS } from "../constants/auditReasons.js";
import * as auditLogService from "../services/auditLog.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Same as users.controller.ts's pageQuerySchema (Stage 15b): a single, fixed message
// regardless of why the value failed.
const pageQuerySchema = z.unknown().transform((value, ctx) => {
  if (value === undefined) return 1;
  if (typeof value === "string") {
    const page = Number(value);
    if (Number.isInteger(page) && page >= 1) return page;
  }
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Page must be a positive integer" });
  return z.NEVER;
});

// Empty string is treated as the param being absent. A repeated param arrives as an array,
// which is not a string, so it falls into the same "must be a string" message.
function usernameSubstringSchema(message: string) {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return value === "" ? undefined : value.trim().toLowerCase();
  });
}

const actionQuerySchema = z.unknown().transform((value, ctx) => {
  if (value === undefined) return undefined;
  const values = Array.isArray(value) ? value : [value];
  const result: (typeof AUDIT_ACTIONS)[number][] = [];
  for (const v of values) {
    if (typeof v !== "string" || !AUDIT_ACTIONS.includes(v as (typeof AUDIT_ACTIONS)[number])) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Action must be one of ${AUDIT_ACTIONS.join(", ")}`,
      });
      return z.NEVER;
    }
    result.push(v as (typeof AUDIT_ACTIONS)[number]);
  }
  return result;
});

const reasonCodeQuerySchema = z.unknown().transform((value, ctx) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !ALL_REASON_CODES.includes(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid reason code" });
    return z.NEVER;
  }
  return value;
});

function dateQuerySchema(label: "From" | "To") {
  return z.unknown().transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (typeof value === "string") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a valid date` });
    return z.NEVER;
  });
}

const sortDirQuerySchema = z.unknown().transform((value, ctx) => {
  if (value === undefined) return "desc";
  if (value === "asc" || value === "desc") return value;
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: "sortDir must be 'asc' or 'desc'" });
  return z.NEVER;
});

const auditLogsQuerySchema = z
  .object({
    page: pageQuerySchema,
    actor: usernameSubstringSchema("Actor must be a string"),
    target: usernameSubstringSchema("Target must be a string"),
    action: actionQuerySchema,
    reasonCode: reasonCodeQuerySchema,
    from: dateQuerySchema("From"),
    to: dateQuerySchema("To"),
    sortDir: sortDirQuerySchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.from && data.to && data.from.getTime() > data.to.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "From must not be after To" });
    }
  });

// GET /admin/audit-logs
export const list = asyncHandler(async (req, res) => {
  const parsed = auditLogsQuerySchema.parse(req.query);
  const result = await auditLogService.listAuditLogs({
    page: parsed.page,
    actor: parsed.actor,
    target: parsed.target,
    actions: parsed.action,
    reasonCode: parsed.reasonCode,
    from: parsed.from,
    to: parsed.to,
    sortDir: parsed.sortDir,
  });
  res.status(200).json(result);
});
