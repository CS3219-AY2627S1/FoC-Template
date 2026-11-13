package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class HttpUserServiceRoleProviderTest {
    private static final String ROLE_CONTEXT_URL = "http://user-service/api/users/role-context";

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"true, COURIER_SUSPENDED", "false, COURIER_ACCEPTANCE_ALLOWED"})
    void preservesCourierRoleAndVerifiedSuspensionWithOneLookup(boolean suspended, String expectedAuthority) {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT_URL)).andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer verified-token"))
                .andRespond(withSuccess("{\"userId\":\"u1\",\"roles\":[\"courier\",\"requester\"],\"isCourierSuspended\":" + suspended + "}", MediaType.APPLICATION_JSON));
        java.util.Collection<org.springframework.security.core.GrantedAuthority> authorities = new FirebaseRoleAuthoritiesConverter(
                new HttpUserServiceRoleProvider(builder.build())).convert(jwt());
        assertEquals(java.util.Set.of("ROLE_COURIER", "ROLE_REQUESTER", expectedAuthority), authorities.stream()
                .map(org.springframework.security.core.GrantedAuthority::getAuthority).collect(java.util.stream.Collectors.toSet()));
        server.verify();
    }

    @Test
    void laterRequestsRefreshSuspensionAndMissingFlagDoesNotGrantAcceptance() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        for (String flag : List.of(",\"isCourierSuspended\":false", ",\"isCourierSuspended\":true", "")) {
            server.expect(requestTo(ROLE_CONTEXT_URL)).andRespond(withSuccess(
                    "{\"userId\":\"u1\",\"roles\":[\"courier\"]" + flag + "}", MediaType.APPLICATION_JSON));
        }
        FirebaseRoleAuthoritiesConverter converter = new FirebaseRoleAuthoritiesConverter(new HttpUserServiceRoleProvider(builder.build()));
        for (java.util.Set<String> expected : List.of(java.util.Set.of("ROLE_COURIER", "COURIER_ACCEPTANCE_ALLOWED"),
                java.util.Set.of("ROLE_COURIER", "COURIER_SUSPENDED"), java.util.Set.of("ROLE_COURIER"))) {
            assertEquals(expected, converter.convert(jwt()).stream().map(org.springframework.security.core.GrantedAuthority::getAuthority)
                    .collect(java.util.stream.Collectors.toSet()));
        }
        server.verify();
    }

    @Test
    void forwardsTheVerifiedCallerTokenAndMapsKnownRolesOnly() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT_URL))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer verified-token"))
                .andRespond(withSuccess(
                        "{\"userId\":\"u1\",\"roles\":[\"requester\",\"ADMIN\",\"unknown\"]}",
                        MediaType.APPLICATION_JSON));

        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());

        assertEquals(java.util.Set.of(Role.REQUESTER, Role.ADMIN), provider.rolesFor(jwt()));
        server.verify();
    }

    @Test
    void missingUserProfileHasNoRolesAndDependencyFailuresFailClosed() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(ROLE_CONTEXT_URL)).andRespond(withStatus(HttpStatus.NOT_FOUND));
        server.expect(requestTo(ROLE_CONTEXT_URL)).andRespond(withServerError());
        HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());

        assertEquals(java.util.Set.of(), provider.rolesFor(jwt()));
        assertThrows(RoleLookupException.class, () -> provider.rolesFor(jwt()));
        server.verify();
    }

    @Test
    void rejectsRoleContextForAnotherIdentityOrMissingFields() {
        for (String body : List.of(
                "{\"userId\":\"other\",\"roles\":[\"admin\"]}",
                "{\"userId\":\"u1\",\"roles\":null}",
                "{}")) {
            RestClient.Builder builder = RestClient.builder().baseUrl("http://user-service");
            MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
            server.expect(requestTo(ROLE_CONTEXT_URL))
                    .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            HttpUserServiceRoleProvider provider = new HttpUserServiceRoleProvider(builder.build());

            assertThrows(RoleLookupException.class, () -> provider.rolesFor(jwt()));
            server.verify();
        }
    }

    private Jwt jwt() {
        return Jwt.withTokenValue("verified-token").header("alg", "none").subject("u1").build();
    }
}
