/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Resolves roles through User Service with the verified caller's bearer token.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

public class HttpUserServiceRoleProvider implements RoleProvider {

    private final RestClient client;

    public HttpUserServiceRoleProvider(RestClient client) {
        this.client = client;
    }

    record RoleContextResponse(String userId, List<String> roles) {
    }

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        RoleContextResponse response;
        try {
            response = client.get()
                    .uri("/api/users/role-context")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + caller.getTokenValue())
                    .retrieve()
                    .body(RoleContextResponse.class);
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                return Set.of();
            }
            throw unavailable(caller, exception);
        } catch (RestClientException exception) {
            throw unavailable(caller, exception);
        }

        if (response == null
                || response.userId() == null
                || !caller.getSubject().equals(response.userId())
                || response.roles() == null) {
            throw unavailable(caller, null);
        }

        Set<Role> roles = EnumSet.noneOf(Role.class);
        response.roles().forEach(value -> Role.fromId(value).ifPresent(roles::add));
        return roles;
    }

    private static RoleLookupException unavailable(Jwt caller, Throwable cause) {
        return new RoleLookupException("User Service role lookup failed for " + caller.getSubject(), cause);
    }
}
