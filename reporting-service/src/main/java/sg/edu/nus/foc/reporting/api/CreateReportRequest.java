/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import io.swagger.v3.oas.annotations.media.Schema;
import sg.edu.nus.foc.reporting.report.ReportCategory;

public record CreateReportRequest(
        @NotBlank @Pattern(regexp = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
        @Schema(description = "Stable browser-generated UUID reused for retries") String submissionId,
        @NotNull @Schema(
        description = "ORDER: requester's active order; the assigned courier responds. ERRAND: courier's active assignment; the requester responds. Both have a 24-hour response window. GENERAL: unlinked. Retired categories remain readable.",
        allowableValues = {"ORDER", "ERRAND", "GENERAL"}) ReportCategory category,
                                  @NotBlank @Size(max = 2000) String description,
                                  String orderId) { }
