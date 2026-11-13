import { z } from "zod";
import { REPORT_STATES } from "../models/report.model.ts";
import { PageQuery, Reason } from "./users.schemas.ts";

export const ReportBody = z.object({
    reportedId: z.string().trim().min(1, "is required"),
    errandId: z.string().trim().min(1, "is required").max(64, "must be at most 64 characters"),
    reason: Reason
});

// F1.6.7: Actioned also suspends the reported account, with the justification as its reason
export const DecisionBody = z.object({
    outcome: z.enum(["Dismissed", "Actioned"], "must be Dismissed or Actioned"),
    justification: Reason
});

export const ListReportsQuery = PageQuery.extend({
    state: z.enum(REPORT_STATES, "must be Open, Dismissed or Actioned").optional(),
    reportedId: z.string().trim().optional()
});
