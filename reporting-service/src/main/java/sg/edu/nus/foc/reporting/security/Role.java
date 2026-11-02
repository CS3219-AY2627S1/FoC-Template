/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.util.Locale;
import java.util.Optional;
public enum Role {
    REQUESTER, COURIER, ADMIN;
    static Optional<Role> fromId(String value) {
        if (value == null) return Optional.empty();
        try { return Optional.of(valueOf(value.strip().toUpperCase(Locale.ROOT))); }
        catch (IllegalArgumentException ignored) { return Optional.empty(); }
    }
}
