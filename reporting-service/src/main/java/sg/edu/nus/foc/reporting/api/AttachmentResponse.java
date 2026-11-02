/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

import java.time.Instant;
import sg.edu.nus.foc.reporting.report.Attachment;
public record AttachmentResponse(String id, String filename, String contentType, long size, Instant uploadedAt) {
    static AttachmentResponse from(Attachment value) { return new AttachmentResponse(value.id(), value.filename(), value.contentType(), value.size(), value.uploadedAt()); }
}
