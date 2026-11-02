/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.oauth2.jwt.Jwt;

class MockRoleProvider implements RoleProvider {
    private final Set<String> admins;
    MockRoleProvider(List<String> emails) {
        admins = emails.stream().map(value -> value.strip().toLowerCase(Locale.ROOT)).filter(value -> !value.isEmpty()).collect(Collectors.toUnmodifiableSet());
    }
    @Override public Set<Role> rolesFor(Jwt caller) {
        Set<Role> roles = EnumSet.of(Role.REQUESTER, Role.COURIER);
        String email = caller.getClaimAsString("email");
        if (email != null && admins.contains(email.strip().toLowerCase(Locale.ROOT))) roles.add(Role.ADMIN);
        return roles;
    }
}
