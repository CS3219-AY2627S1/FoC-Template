/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.application.reportcreation;

public final class ReportCreationMessages {
    private ReportCreationMessages(){ }
    public record Compensation(String eventId,String submissionId,String reportId,String orderId,
                               String reporterId,long generation){ }
    public record Result(String eventId,String compensationId,String submissionId,String reportId,
                         String orderId,String reporterId,long generation,String outcome){ }
}
