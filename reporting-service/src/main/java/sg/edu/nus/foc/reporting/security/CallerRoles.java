/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

@Component("callerRoles")
public class CallerRoles {
    private final RoleProvider provider;
    CallerRoles(RoleProvider provider) { this.provider = provider; }
    public boolean isAdmin(Authentication authentication) {
        return authentication instanceof JwtAuthenticationToken token && provider.rolesFor(token.getToken()).contains(Role.ADMIN);
    }
}
