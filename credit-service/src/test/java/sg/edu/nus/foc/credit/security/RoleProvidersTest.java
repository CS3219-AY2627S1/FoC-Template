/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Test generation.
 * Scope: Generate tests based on the provided scope.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RoleProvidersTest {

    private static final String ROLE_CONTEXT = "http://user-service/api/users/role-context";

    @Test
    void mockProviderGrantsStandardRolesAndConfiguredAdminRole() {
        MockUserServiceRoleProvider provider = new MockUserServiceRoleProvider(
                List.of(" Admin@U.NUS.edu ", ""));

        assertThat(provider.rolesFor(token("u1", "student@u.nus.edu")))
                .containsExactlyInAnyOrder(Role.REQUESTER, Role.COURIER);
        assertThat(provider.rolesFor(token("u2", "admin@u.nus.edu")))
                .containsExactlyInAnyOrder(Role.REQUESTER, Role.COURIER, Role.ADMIN);
        assertThat(provider.rolesFor(token("u3", null))).doesNotContain(Role.ADMIN);
    }

    @Test
    void httpProviderForwardsTokenValidatesIdentityAndMapsKnownRoles() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-u1"))
                .andRespond(withSuccess(
                        "{\"userId\":\"u1\",\"roles\":[\"requester\",\" COURIER \",\"superhero\"]}",
                        MediaType.APPLICATION_JSON));

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThat(provider.rolesFor(token("u1", null)))
                .containsExactlyInAnyOrder(Role.REQUESTER, Role.COURIER);
        server.verify();
    }

    @Test
    void httpProviderTreatsMissingProfilesAsHavingNoRoles() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withStatus(HttpStatus.NOT_FOUND));

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThat(provider.rolesFor(token("missing", null))).isEmpty();
        server.verify();
    }

    @Test
    void httpProviderFailsClosedForInvalidOrUnavailableRoleContext() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT))
                .andRespond(withSuccess("{\"userId\":\"other\",\"roles\":[\"courier\"]}",
                        MediaType.APPLICATION_JSON));
        server.expect(requestTo(ROLE_CONTEXT))
                .andRespond(withSuccess("{\"userId\":\"u1\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo(ROLE_CONTEXT))
                .andRespond(withSuccess("not-json", MediaType.APPLICATION_JSON));
        server.expect(requestTo(ROLE_CONTEXT))
                .andRespond(withSuccess("", MediaType.APPLICATION_JSON));
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withServerError());

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        server.verify();
    }

    @Test
    void httpProviderMapsConnectionTimeoutsToRoleLookupFailures() {
        RestClient client = RestClient.builder()
                .baseUrl("http://user-service")
                .requestFactory((uri, method) -> {
                    throw new IOException("timed out");
                })
                .build();

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(client);
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null)))
                .isInstanceOf(RoleLookupException.class)
                .hasCauseInstanceOf(org.springframework.web.client.ResourceAccessException.class);
    }

    @Test
    void converterProducesAuthoritiesAndMapsLookupFailuresToAuthenticationFailures() {
        FirebaseRoleAuthoritiesConverter converter = new FirebaseRoleAuthoritiesConverter(
                caller -> java.util.Set.of(Role.COURIER));
        assertThat(converter.convert(token("u1", null)))
                .extracting(authority -> authority.getAuthority())
                .containsExactly("ROLE_COURIER");

        FirebaseRoleAuthoritiesConverter failing = new FirebaseRoleAuthoritiesConverter(caller -> {
            throw new RoleLookupException("offline", null);
        });
        assertThatThrownBy(() -> failing.convert(token("u1", null)))
                .isInstanceOf(AuthenticationServiceException.class)
                .hasCauseInstanceOf(RoleLookupException.class);
    }

    @Test
    void roleIdsMapCaseInsensitivelyAndIgnoreUnknownValues() {
        assertThat(Role.fromId(" courier ")).contains(Role.COURIER);
        assertThat(Role.fromId("nope")).isEmpty();
        assertThat(Role.fromId(null)).isEmpty();
        assertThat(Role.ADMIN.authority()).isEqualTo("ROLE_ADMIN");
    }

    private static Jwt token(String uid, String email) {
        Jwt.Builder builder = Jwt.withTokenValue("token-" + uid).header("alg", "none").subject(uid);
        if (email != null) {
            builder.claim("email", email);
        }
        return builder.build();
    }
}
