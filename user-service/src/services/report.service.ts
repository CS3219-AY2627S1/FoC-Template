import mongoose from "mongoose";
import { AppError } from "../errors.ts";
import { logger } from "../lib/logger.ts";
import { fieldErrorsOf, validationError } from "../lib/validation.ts";
import { ReportModel, toFiledReport, type Report } from "../models/report.model.ts";
import { UserModel, type AccountSummary } from "../models/user.model.ts";
import { DecisionBody, ListReportsQuery, ReportBody } from "../schemas/reports.schemas.ts";
import { accountSummaries, applyStateChange } from "./user.service.ts";
import { findErrandParticipants } from "../lib/orders.ts";

function notFound(): AppError {
    return new AppError(404, "REPORT_NOT_FOUND", "No report with this id");
}

// F1.6.3 and F1.6.4: every refusal names the field it is about.
export async function fileReport(reporterId: string, input: unknown) {
    const parsed = ReportBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { reportedId, errandId, reason } = parsed.data;

    if (reportedId === reporterId) {
        throw validationError({ reportedId: ["cannot be your own account"] });
    }
    if (!(await UserModel.exists({ _id: reportedId }))) {
        throw validationError({ reportedId: ["does not exist"] });
    }

    // One of the two must have been the requester and the other the courier, in either order.
    const errand = await findErrandParticipants(errandId);
    if (!errand) throw validationError({ errandId: ["does not exist"] });
    const pair = [errand.requesterId, errand.courierId];
    if (!pair.includes(reporterId) || !pair.includes(reportedId)) {
        throw validationError({ errandId: ["is not an errand between you and this account"] });
    }

    try {
        const report = await ReportModel.create({ reporterId, reportedId, errandId, reason });
        logger.info({ reportId: report._id, reporterId, reportedId, errandId }, "report filed");
        return toFiledReport(report);
    } catch (err) {
        // The unique index decides, so two identical reports sent at once still make only one
        if (err instanceof mongoose.mongo.MongoServerError && err.code === 11000) {
            throw validationError({ errandId: ["has already been reported by you"] });
        }
        throw err;
    }
}

// F5.5.4: newest first, optionally only one state or one reported account.
export async function listReports(query: unknown) {
    const parsed = ListReportsQuery.safeParse(query);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { page, pageSize, state, reportedId } = parsed.data;
    const filter = {
        ...(state ? { state } : {}),
        ...(reportedId ? { reportedId } : {}),
    };

    const [reports, total] = await Promise.all([
        ReportModel.find(filter)
            .sort({ filedAt: -1, _id: 1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize),
        ReportModel.countDocuments(filter),
    ]);
    // One lookup for every account on the page, so the dashboard needs no request per row
    const accounts = await accountSummaries(reports.flatMap(accountIdsOf));
    return { items: reports.map((report) => toAdminReport(report, accounts)), page, pageSize, total };
}

export async function getReport(reportId: string): Promise<AdminReport> {
    const report = await ReportModel.findById(reportId);
    if (!report) throw notFound();
    return toAdminReport(report, await accountSummaries(accountIdsOf(report)));
}

// F1.6.6 and F1.6.7. There are no transactions on this database, so the report is decided first
// and put back to Open when the suspension is refused.
export async function decideReport(reportId: string, actorId: string, input: unknown): Promise<AdminReport> {
    const parsed = DecisionBody.safeParse(input);
    if (!parsed.success) throw validationError(fieldErrorsOf(parsed.error));
    const { outcome, justification } = parsed.data;

    const decision = { byId: actorId, justification, decidedAt: new Date() };
    // Only an Open report matches, so of two parallel decisions exactly one applies
    const report = await ReportModel.findOneAndUpdate(
        { _id: reportId, state: "Open" },
        { $set: { state: outcome, decision } },
        { returnDocument: "after" },
    );
    if (!report) {
        if (!(await ReportModel.exists({ _id: reportId }))) throw notFound();
        throw new AppError(409, "REPORT_ALREADY_DECIDED", "This report has already been decided");
    }

    if (outcome === "Actioned") {
        try {
            await applyStateChange(report.reportedId, actorId, "Suspended", justification);
        } catch (err) {
            // An account that is no longer Active, or no longer exists, stays as it is and the
            // report is still Actioned. Any other refusal (own account, last administrator) undoes it.
            const keepsDecision = err instanceof AppError && (err.code === "INVALID_STATE_CHANGE" || err.code === "USER_NOT_FOUND");
            if (!keepsDecision) {
                await ReportModel.updateOne(
                    { _id: reportId, state: outcome, "decision.byId": actorId, "decision.decidedAt": decision.decidedAt },
                    { $set: { state: "Open" }, $unset: { decision: 1 } },
                );
                throw err;
            }
        }
    }

    logger.info({ reportId, actorId, outcome }, "report decided");
    return toAdminReport(report, await accountSummaries(accountIdsOf(report)));
}

function accountIdsOf(report: Report): string[] {
    return [report.reporterId, report.reportedId, ...(report.decision ? [report.decision.byId] : [])];
}

// A report as administrators see it (F1.6.5). An account deleted since then shows as null.
function toAdminReport(report: Report, accounts: Map<string, AccountSummary>) {
    return {
        id: report._id,
        reporter: accounts.get(report.reporterId) ?? null,
        reported: accounts.get(report.reportedId) ?? null,
        errandId: report.errandId,
        reason: report.reason,
        state: report.state,
        filedAt: report.filedAt,
        decision: report.decision
            ? {
                by: accounts.get(report.decision.byId) ?? null,
                justification: report.decision.justification,
                decidedAt: report.decision.decidedAt,
            }
            : null,
    };
}

export type AdminReport = ReturnType<typeof toAdminReport>;
