/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.error;
public class BadRequestException extends RuntimeException {
    private final String field;
    public BadRequestException(String message) { this(message, null); }
    public BadRequestException(String message, String field) { super(message); this.field = field; }
    public String field() { return field; }
}
