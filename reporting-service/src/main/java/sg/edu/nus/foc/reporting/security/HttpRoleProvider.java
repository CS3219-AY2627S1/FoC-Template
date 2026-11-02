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
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

class HttpRoleProvider implements RoleProvider {
    private final RestClient client;
    HttpRoleProvider(RestClient client) { this.client = client; }
    record RoleContext(List<String> roles) { }
    @Override public Set<Role> rolesFor(Jwt caller) {
        Set<Role> roles = EnumSet.noneOf(Role.class);
        try {
            RoleContext result = client.get().uri("/api/users/role-context")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + caller.getTokenValue()).retrieve().body(RoleContext.class);
            if (result != null && result.roles() != null) result.roles().forEach(value -> Role.fromId(value).ifPresent(roles::add));
            return roles;
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) return roles;
            throw new RoleLookupException(e);
        } catch (RestClientException e) { throw new RoleLookupException(e); }
    }
}
