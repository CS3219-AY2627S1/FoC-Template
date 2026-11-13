package sg.edu.nus.foc.supplier.security;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import sg.edu.nus.foc.supplier.web.RequestIdFilter;

/**
 * Calls the User Service role endpoint on the caller's behalf:
 * {@code GET {USER_SERVICE_URL}/api/users/role-context} with the caller's own bearer token, returning
 * {@code {"userId": "...", "roles": ["requester", ...]}}. The request ID is forwarded so both services' logs
 * can be correlated.
 * A caller with no User Service profile yet (404) has no roles. Unknown role names are ignored so the
 * User Service can add roles without breaking this service.
 */
public class HttpUserServiceRoleProvider implements RoleProvider {

    private final RestClient client;

    public HttpUserServiceRoleProvider(RestClient client) {
        this.client = client;
    }

    record RoleContextResponse(String userId, List<String> roles) {
    }

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        Set<Role> roles = EnumSet.noneOf(Role.class);
        RoleContextResponse response;
        try {
            response = client.get().uri("/api/users/role-context")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + caller.getTokenValue())
                    .headers(headers -> {
                        String requestId = MDC.get(RequestIdFilter.MDC_KEY);
                        if (requestId != null) {
                            headers.set(RequestIdFilter.HEADER, requestId);
                        }
                    })
                    .retrieve()
                    .body(RoleContextResponse.class);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                return roles;
            }
            throw new RoleLookupException("User Service role lookup failed for " + caller.getSubject(), e);
        } catch (RestClientException e) {
            throw new RoleLookupException("User Service role lookup failed for " + caller.getSubject(), e);
        }
        if (response != null && response.roles() != null) {
            response.roles().forEach(value -> Role.fromId(value).ifPresent(roles::add));
        }
        return roles;
    }
}
