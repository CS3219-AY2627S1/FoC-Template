/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.time.Instant;
import java.util.List;

import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;

public record Report(String id, String reporterId, ReportCategory category, String description,
                     String orderId, String courierId, ReportStatus status, Instant createdAt,
                     Instant responseDeadlineAt, String courierResponse, Instant respondedAt,
                     Instant resolvedAt, List<Attachment> attachments,
                     List<Attachment> responseAttachments, String resolutionNote, String resolvedBy, String requesterId) {
    public Report(String id, String reporterId, ReportCategory category, String description,
                  String orderId, String courierId, ReportStatus status, Instant createdAt,
                  Instant responseDeadlineAt, String courierResponse, Instant respondedAt,
                  Instant resolvedAt, List<Attachment> attachments, List<Attachment> responseAttachments,
                  String resolutionNote, String resolvedBy) {
        this(id, reporterId, category, description, orderId, courierId, status, createdAt, responseDeadlineAt,
                courierResponse, respondedAt, resolvedAt, attachments, responseAttachments, resolutionNote, resolvedBy, null);
    }
    public Report(String id, String reporterId, ReportCategory category, String description,
                  String orderId, String courierId, ReportStatus status, Instant createdAt,
                  Instant responseDeadlineAt, String courierResponse, Instant respondedAt,
                  Instant resolvedAt, List<Attachment> attachments, List<Attachment> responseAttachments) {
        this(id, reporterId, category, description, orderId, courierId, status, createdAt,
                responseDeadlineAt, courierResponse, respondedAt, resolvedAt, attachments,
                responseAttachments, null, null);
    }
    public Report {
        // Historical linked reports were requester-submitted. ERRAND must carry its actual owner.
        if (requesterId == null && orderId != null && category != ReportCategory.ERRAND) requesterId = reporterId;
        attachments = List.copyOf(attachments == null ? List.of() : attachments);
        responseAttachments = List.copyOf(responseAttachments == null ? List.of() : responseAttachments);
    }

    public Report reconcile(Instant now) {
        if (category == ReportCategory.ERRAND && status != ReportStatus.RESOLVED
                && responseDeadlineAt == null && respondedAt == null
                && requesterId != null && reporterId.equals(courierId)) {
            return new Report(id, reporterId, ReportCategory.ERRAND, description, orderId, courierId,
                    ReportStatus.AWAITING_COURIER_RESPONSE, createdAt, now.plusSeconds(86400),
                    courierResponse, respondedAt, resolvedAt, attachments, responseAttachments,
                    resolutionNote, resolvedBy, requesterId);
        }
        if (status != ReportStatus.AWAITING_COURIER_RESPONSE || responseDeadlineAt == null
                || now.isBefore(responseDeadlineAt)) return this;
        return copy(ReportStatus.READY_FOR_REVIEW, responseDeadlineAt, courierResponse, respondedAt, resolvedAt,
                responseAttachments);
    }

    public Report respond(String callerId, String explanation, Instant at, List<Attachment> evidence) {
        Report current = reconcile(at);
        if (callerId == null || !callerId.equals(current.respondentId())) {
            throw new ForbiddenException("Only the other order participant can respond to this report.");
        }
        if (current.respondedAt != null) throw new ConflictException("A response has already been submitted.");
        if (current.status != ReportStatus.AWAITING_COURIER_RESPONSE) {
            throw new ConflictException(responseDeadlineAt != null && !at.isBefore(responseDeadlineAt)
                    ? "The 24-hour response window has closed."
                    : "This report no longer accepts a response.");
        }
        return current.copy(ReportStatus.READY_FOR_REVIEW, current.responseDeadlineAt, explanation, at, current.resolvedAt, evidence);
    }

    public Report resolved(Instant at) {
        Report current = reconcile(at);
        if (current.status == ReportStatus.RESOLVED) return current;
        return current.copy(ReportStatus.RESOLVED, current.responseDeadlineAt, current.courierResponse,
                current.respondedAt, at, current.responseAttachments);
    }

    /** Opposite participant; independent of who submitted the complaint. */
    public String respondentId() {
        if (orderId == null || courierId == null) return null;
        return reporterId.equals(courierId) ? requesterId : courierId;
    }

    public boolean participant(String callerId) {
        return reporterId.equals(callerId) || (respondentId() != null && respondentId().equals(callerId));
    }

    private Report copy(ReportStatus nextStatus, Instant deadline, String response, Instant responseAt,
                        Instant resolutionAt, List<Attachment> responseEvidence) {
        return new Report(id, reporterId, category, description, orderId, courierId, nextStatus, createdAt,
                deadline, response, responseAt, resolutionAt, attachments, responseEvidence, resolutionNote, resolvedBy, requesterId);
    }
}
