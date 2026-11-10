/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

import java.time.Instant;
import sg.edu.nus.foc.reporting.report.ReportCreationCoordinator;
import sg.edu.nus.foc.reporting.report.ReportSubmissionState;

public record ReportSubmissionResponse(String submissionId, String reportId,
        ReportSubmissionState state, String lastError, Instant updatedAt, ReportResponse report) {
    public static ReportSubmissionResponse from(ReportCreationCoordinator.Outcome outcome) {
        var s=outcome.submission();
        return new ReportSubmissionResponse(s.submissionId(),s.reportId(),s.state(),s.lastError(),s.updatedAt(),
                outcome.report()==null?null:ReportResponse.from(outcome.report()));
    }
}
