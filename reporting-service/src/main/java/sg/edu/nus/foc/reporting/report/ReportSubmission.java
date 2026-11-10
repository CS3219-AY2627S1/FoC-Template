/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.time.Instant;
import java.util.List;

public record ReportSubmission(
        String submissionId,
        String reportId,
        String reporterId,
        String inputFingerprint,
        ReportCategory category,
        String orderId,
        String description,
        List<ManifestItem> attachments,
        ReportSubmissionState state,
        boolean fenced,
        long revision,
        long attempts,
        Instant nextAttemptAt,
        Instant leaseUntil,
        String requesterId,
        String courierId,
        String orderStatus,
        String lastError,
        Instant createdAt,
        Instant updatedAt) {

    public ReportSubmission {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
    }

    public boolean terminal() {
        return state == ReportSubmissionState.COMPLETED || state == ReportSubmissionState.REJECTED
                || state == ReportSubmissionState.COMPENSATED
                || state == ReportSubmissionState.RECONCILIATION_REQUIRED;
    }

    public record ManifestItem(int index, String attachmentId, String objectKey,
                               String filename, String contentType, long size, String sha256) { }
}
