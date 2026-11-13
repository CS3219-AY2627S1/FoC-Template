package sg.edu.nus.foc.supplier.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.supplier.web.RequestIdFilter;

class RoleProvidersTest {

    private static final String ROLE_CONTEXT = "http://user-service/api/users/role-context";

    private static Jwt token(String uid, String email) {
        Jwt.Builder builder = Jwt.withTokenValue("token-" + uid).header("alg", "none").subject(uid);
        if (email != null) {
            builder.claim("email", email);
        }
        return builder.build();
    }

    @Test
    void mockGivesEveryoneRequesterAndCourierAndAdminsByEmail() {
        MockUserServiceRoleProvider provider = new MockUserServiceRoleProvider(List.of(" Admin@U.NUS.edu ", ""));
        assertThat(provider.rolesFor(token("u1", "student@u.nus.edu")))
                .containsExactlyInAnyOrder(Role.REQUESTER, Role.COURIER);
        assertThat(provider.rolesFor(token("u2", "admin@u.nus.edu"))).contains(Role.ADMIN);
        assertThat(provider.rolesFor(token("u3", null))).doesNotContain(Role.ADMIN);
    }

    @Test
    void httpProviderForwardsTheCallersTokenAndMapsKnownRoles() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer token-u1"))
                .andRespond(withSuccess("{\"userId\":\"u1\",\"roles\":[\"requester\",\"ADMIN\",\"superhero\"]}",
                        MediaType.APPLICATION_JSON));

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThat(provider.rolesFor(token("u1", null))).containsExactlyInAnyOrder(Role.REQUESTER, Role.ADMIN);
        server.verify();
    }

    @Test
    void httpProviderForwardsTheRequestIdForLogCorrelation() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT))
                .andExpect(header(RequestIdFilter.HEADER, "req-1"))
                .andRespond(withSuccess("{\"userId\":\"u1\",\"roles\":[\"courier\"]}", MediaType.APPLICATION_JSON));

        MDC.put(RequestIdFilter.MDC_KEY, "req-1");
        try {
            assertThat(new HttpUserServiceRoleProvider(builder.build()).rolesFor(token("u1", null)))
                    .containsExactly(Role.COURIER);
        } finally {
            MDC.remove(RequestIdFilter.MDC_KEY);
        }
        server.verify();
    }

    @Test
    void httpProviderTreatsMissingProfilesAsNoRoles() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThat(provider.rolesFor(token("u1", null))).isEmpty();
        assertThat(provider.rolesFor(token("u2", null))).isEmpty();
        server.verify();
    }

    @Test
    void httpProviderFailsOnOtherErrors() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        server.expect(requestTo(ROLE_CONTEXT)).andRespond(withServerError());

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());
        assertThatThrownBy(() -> provider.rolesFor(token("u1", null))).isInstanceOf(RoleLookupException.class);
        assertThatThrownBy(() -> provider.rolesFor(token("u2", null))).isInstanceOf(RoleLookupException.class);
        server.verify();
    }

    @Test
    void roleIdsRoundTrip() {
        assertThat(Role.fromId(" courier ")).contains(Role.COURIER);
        assertThat(Role.fromId("nope")).isEmpty();
        assertThat(Role.fromId(null)).isEmpty();
        assertThat(Role.ADMIN.id()).isEqualTo("admin");
        assertThat(Role.ADMIN.authority()).isEqualTo("ROLE_ADMIN");
    }
}
