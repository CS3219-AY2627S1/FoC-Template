/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Implementation.
 * Scope: Generated the validated courier response request contract for Reporting Service.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateReportResponseRequest(@NotBlank @Size(max = 2000) String explanation) { }
