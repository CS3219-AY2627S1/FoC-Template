/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated error types and mappings for the team-finalized API error contract.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.error;

public final class SecurityMessages {

    public static final String UNAUTHENTICATED =
            "Sign in to continue: a valid Firebase ID token is required in the Authorization header.";
    public static final String FORBIDDEN = "You do not have permission to perform this credit operation.";
    public static final String ROLE_LOOKUP_UNAVAILABLE = "User Service role lookup is unavailable.";

    private SecurityMessages() {
    }
}
