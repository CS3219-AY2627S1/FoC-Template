import { randomUUID } from "node:crypto";
import { Schema, model, type InferSchemaType } from "mongoose";

export const REPORT_STATES = ["Open", "Dismissed", "Actioned"] as const;
export type ReportState = (typeof REPORT_STATES)[number];

const decisionSchema = new Schema(
    {
        byId: { type: String, required: true },
        justification: { type: String, required: true },
        decidedAt: { type: Date, required: true },
    },
    { _id: false },
);

// F1.6.5. errandId is a string because the Order Service numbers its errands itself.
const reportSchema = new Schema(
    {
        _id: { type: String, default: () => randomUUID() },
        reporterId: { type: String, required: true },
        reportedId: { type: String, required: true },
        errandId: { type: String, required: true },
        reason: { type: String, required: true },
        state: { type: String, enum: REPORT_STATES, default: "Open" },
        filedAt: { type: Date, required: true, default: () => new Date() },
        decision: { type: decisionSchema },
    },
    { versionKey: false },
);

// F1.6.4: one report per reporter and errand, which the database keeps even for parallel requests
reportSchema.index({ reporterId: 1, errandId: 1 }, { unique: true });
// The administrators' list (F5.5.4): newest first, by state or by reported account. _id keeps
// reports filed in the same millisecond in a fixed order across pages.
reportSchema.index({ filedAt: -1, _id: 1 });
reportSchema.index({ state: 1, filedAt: -1, _id: 1 });
reportSchema.index({ reportedId: 1, filedAt: -1, _id: 1 });

export type Report = InferSchemaType<typeof reportSchema>;
export const ReportModel = model("Report", reportSchema);

// What the reporter gets back. The admin view with names and the decision comes with the report list.
export function toFiledReport(report: Report) {
    return {
        id: report._id,
        reportedId: report.reportedId,
        errandId: report.errandId,
        reason: report.reason,
        state: report.state,
        filedAt: report.filedAt,
    };
}
