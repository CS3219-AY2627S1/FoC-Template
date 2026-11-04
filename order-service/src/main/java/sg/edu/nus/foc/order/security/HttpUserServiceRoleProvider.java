package sg.edu.nus.foc.order.security;

import java.util.EnumSet;
import java.util.Set;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import sg.edu.nus.foc.order.security.dto.UserRoleContextResponse;

/** Retrieves the token owner's roles from User Service using the verified caller token. */
@RequiredArgsConstructor
public class HttpUserServiceRoleProvider implements RoleProvider {

    private final RestClient client;

    @Override
    public Set<Role> rolesFor(Jwt caller) {
        return contextFor(caller).roles();
    }

    @Override
    public CallerRoleContext contextFor(Jwt caller) {
        Set<Role> roles = EnumSet.noneOf(Role.class);
        UserRoleContextResponse response;
        try {
            response = client.get()
                    .uri("/api/users/role-context")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + caller.getTokenValue())
                    .retrieve()
                    .body(UserRoleContextResponse.class);
        } catch (HttpClientErrorException exception) {
            if (exception.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                return new CallerRoleContext(roles, null);
            }
            throw new RoleLookupException("User Service role lookup failed for " + caller.getSubject(), exception);
        } catch (RestClientException exception) {
            throw new RoleLookupException("User Service role lookup failed for " + caller.getSubject(), exception);
        }
        if (response == null
                || !caller.getSubject().equals(response.getUserId())
                || response.getRoles() == null) {
            throw new RoleLookupException("User Service returned an invalid caller role context.", null);
        }
        response.getRoles().forEach(value -> Role.fromId(value).ifPresent(roles::add));
        return new CallerRoleContext(roles, response.getCourierSuspended());
    }
}
