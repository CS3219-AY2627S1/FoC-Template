package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.client.match.MockRestRequestMatchers;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.order.domain.OrderProblem;

class HttpPeerAdaptersTest {
    @Test void mapsSupplierOutageAndCreditAssignmentConflictWithoutGeneric500() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(builder.build(), builder.build(), builder.build());
        server.expect(requestTo("/api/suppliers/validate")).andRespond(withServerError());
        server.expect(requestTo("/api/credits/orders/order/courier-assignment")).andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT));
        server.expect(requestTo("/api/credits/orders/order/hold-for-reopen")).andRespond(withException(new java.io.IOException("timeout")));
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> adapters.validatePair("p", "d", null)).getCode());
        assertEquals("CONFLICT", assertThrows(OrderProblem.class, () -> adapters.assignCourier("order", "courier", null)).getCode());
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class, () -> adapters.holdForReopen("order", null)).getCode());
        server.verify();
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
        "400, VALIDATION_ERROR", "401, UNAUTHENTICATED", "404, NOT_FOUND",
        "429, SERVICE_UNAVAILABLE", "503, SERVICE_UNAVAILABLE"
    })
    void mapsReservationRejectionWithoutLeakingPeerBody(int status, String expected) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(), RestClient.builder().build(), builder.build());
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatusCode.valueOf(status))
                        .body("sensitive peer diagnostic"));
        OrderProblem problem = assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, "Bearer token"));
        assertEquals(expected, problem.getCode());
        assertFalse(problem.getMessage().contains("sensitive"));
        server.verify();
    }

    @Test
    void rejectsUnconfirmedEmptyConflictAndTransportFailures() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(), RestClient.builder().build(), builder.build());
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT));
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withException(new java.io.IOException("offline")));
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, null)).getCode());
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, null)).getCode());
        server.verify();
    }

    @Test
    void preservesConfirmedInsufficientCreditsButNotOtherConflicts() {
        RestClient.Builder creditBuilder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(creditBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(), RestClient.builder().build(), creditBuilder.build());
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"INSUFFICIENT_CREDITS\",\"message\":\"not enough\"}"));
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"RESERVATION_CONFLICT\"}"));

        OrderProblem insufficient = assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, "Bearer token"));
        assertEquals("INSUFFICIENT_CREDITS", insufficient.getCode());
        OrderProblem conflict = assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, "Bearer token"));
        assertEquals("CONFLICT", conflict.getCode());
        server.verify();
    }

    @Test
    void preservesCreditAuthorizationFailureAndTreatsMalformedConflictAsConflict() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(), RestClient.builder().build(), builder.build());
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.FORBIDDEN));
        server.expect(requestTo("/api/credits/orders/candidate/reservation"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT).body("not JSON"));
        assertEquals("FORBIDDEN", assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, null)).getCode());
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> adapters.reserve("candidate", "requester", 2, null)).getCode());
        server.verify();
    }

    @Test
    void forwardsAuthenticatedUserAndCourierChecks() {
        RestClient.Builder userBuilder = RestClient.builder();
        MockRestServiceServer userServer = MockRestServiceServer.bindTo(userBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(userBuilder.build(), RestClient.builder().build(), RestClient.builder().build());

        userServer.expect(requestTo("/api/users/role-context"))
            .andExpect(header("Authorization", "Bearer token"))
            .andRespond(withSuccess("{\"userId\":\"requester\",\"roles\":[\"requester\"]}", MediaType.APPLICATION_JSON));
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"]}", MediaType.APPLICATION_JSON));
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"other\",\"roles\":[\"requester\"]}", MediaType.APPLICATION_JSON));

        assertEquals("requester", adapters.verifyRequester("requester", "Bearer token"));
        assertEquals("courier", adapters.verifyCourier("courier", "Bearer token"));
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> adapters.verifyRequester("requester", "Bearer token"));
        userServer.verify();
    }

    @Test
    void rejectsIneligibleCourier() {
        RestClient.Builder userBuilder = RestClient.builder();
        MockRestServiceServer userServer = MockRestServiceServer.bindTo(userBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(userBuilder.build(), RestClient.builder().build(), RestClient.builder().build());
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"],\"isCourierSuspended\":true}", MediaType.APPLICATION_JSON));
        OrderProblem denied = assertThrows(sg.edu.nus.foc.order.domain.CourierAcceptanceDenied.class,
                () -> adapters.requireCourierAcceptance("courier", "Bearer token"));
        assertEquals("FORBIDDEN", denied.getCode());
        assertTrue(denied.getMessage().contains("suspended"));
        userServer.verify();
    }

    @Test
    void suspendedCourierRetainsExistingWorkIdentityThroughRoleContext() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(builder.build(), RestClient.builder().build(), RestClient.builder().build());
        server.expect(requestTo("/api/users/role-context"))
                .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"],\"isCourierSuspended\":true}", MediaType.APPLICATION_JSON));
        assertEquals("courier", adapters.verifyCourier("courier", "Bearer token"));
        server.verify();
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"", ",\"isCourierSuspended\":null"})
    void missingSuspensionDoesNotAuthorizeNewAcceptance(String flag) {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(builder.build(), RestClient.builder().build(), RestClient.builder().build());
        server.expect(requestTo("/api/users/role-context"))
                .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"]" + flag + "}", MediaType.APPLICATION_JSON));
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class,
                () -> adapters.requireCourierAcceptance("courier", "Bearer token")).getCode());
        server.verify();
    }

    @Test
    void verifiedSuspensionRejectsNewWorkButNotExistingWorkAndDoesNotTrustPlainAuthorityStrings() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(builder.build(), RestClient.builder().build(), RestClient.builder().build());
        org.springframework.security.oauth2.jwt.Jwt token = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("token")
                .header("alg", "RS256").subject("courier").build();
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(token, java.util.List.of(
                        new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_COURIER"),
                        new sg.edu.nus.foc.order.security.CourierSuspensionAuthority(true))));
        try {
            assertEquals("courier", adapters.verifyCourier("courier", "Bearer token"));
            assertThrows(sg.edu.nus.foc.order.domain.CourierAcceptanceDenied.class,
                    () -> adapters.requireCourierAcceptance("courier", "Bearer token"));
            assertThrows(OrderProblem.class, () -> adapters.requireCourierAcceptance("other", "Bearer token"));
            server.expect(requestTo("/api/users/role-context"))
                    .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"],\"isCourierSuspended\":true}", MediaType.APPLICATION_JSON));
            org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(token, java.util.List.of(
                            new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_COURIER"),
                            new org.springframework.security.core.authority.SimpleGrantedAuthority("COURIER_ACCEPTANCE_ALLOWED"))));
            assertThrows(sg.edu.nus.foc.order.domain.CourierAcceptanceDenied.class,
                    () -> adapters.requireCourierAcceptance("courier", "Bearer token"));
            server.verify();
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    void rejectsMissingOrMismatchedPeerIdentityContext() {
        RestClient.Builder userBuilder = RestClient.builder();
        MockRestServiceServer userServer = MockRestServiceServer.bindTo(userBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(userBuilder.build(), RestClient.builder().build(), RestClient.builder().build());
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"requester\",\"roles\":null}", MediaType.APPLICATION_JSON));
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"\",\"roles\":[\"requester\"]}", MediaType.APPLICATION_JSON));
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"requester\",\"roles\":[\"courier\"]}", MediaType.APPLICATION_JSON));
        userServer.expect(requestTo("/api/users/role-context"))
            .andRespond(withSuccess("{\"userId\":\"courier\",\"roles\":[\"courier\"]}", MediaType.APPLICATION_JSON));

        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> adapters.verifyRequester("requester", null));
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> adapters.verifyRequester("requester", null));
        assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class, () -> adapters.verifyRequester("requester", null));
        assertEquals("courier", adapters.verifyCourier("courier", null));
        userServer.verify();
    }

    @Test
    void productionCallerReusesConfirmedRolesAndSuspensionWithoutAnotherLookup() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                builder.build(), RestClient.builder().build(), RestClient.builder().build());
        org.springframework.security.oauth2.jwt.Jwt caller = org.springframework.security.oauth2.jwt.Jwt
                .withTokenValue("token").header("alg", "RS256").subject("u1").build();
        server.expect(requestTo("/api/users/role-context"))
                .andRespond(withSuccess("{\"userId\":\"u1\",\"roles\":[\"requester\",\"courier\"],\"isCourierSuspended\":false}", MediaType.APPLICATION_JSON));
        org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken authentication =
                new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(caller,
                        new sg.edu.nus.foc.order.security.FirebaseRoleAuthoritiesConverter(
                                new sg.edu.nus.foc.order.security.HttpUserServiceRoleProvider(builder.build())).convert(caller));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(authentication);
        try {
            assertEquals("u1", adapters.verifyRequester("u1", "Bearer token"));
            assertEquals("u1", adapters.verifyCourier("u1", "Bearer token"));
            adapters.requireCourierAcceptance("u1", "Bearer token");
            assertThrows(sg.edu.nus.foc.order.domain.OrderProblem.class,
                    () -> adapters.verifyRequester("other", "Bearer token"));
            server.verify();
        } finally {
            org.springframework.security.core.context.SecurityContextHolder.clearContext();
        }
    }

    @Test
    void courierEligibilityDependencyFailureIsReportedAsUnavailable() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                builder.build(), RestClient.builder().build(), RestClient.builder().build());
        server.expect(requestTo("/api/users/role-context")).andRespond(withServerError());

        sg.edu.nus.foc.order.domain.OrderProblem problem = assertThrows(
                sg.edu.nus.foc.order.domain.OrderProblem.class,
                () -> adapters.requireCourierAcceptance("courier", "Bearer token"));

        assertEquals("SERVICE_UNAVAILABLE", problem.getCode());
        server.verify();
    }

    @Test
    void forwardsSupplierAndCreditCommands() {
        RestClient.Builder supplierBuilder = RestClient.builder();
        RestClient.Builder creditBuilder = RestClient.builder();
        MockRestServiceServer supplierServer = MockRestServiceServer.bindTo(supplierBuilder).build();
        MockRestServiceServer creditServer = MockRestServiceServer.bindTo(creditBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(RestClient.builder().build(), supplierBuilder.build(), creditBuilder.build());

        supplierServer.expect(requestTo("/api/suppliers/validate"))
            .andExpect(method(org.springframework.http.HttpMethod.POST))
            .andRespond(withSuccess("{\"valid\":true,\"problems\":[]}", MediaType.APPLICATION_JSON));
        creditServer.expect(requestTo("/api/credits/orders/order/reservation"))
            .andExpect(method(org.springframework.http.HttpMethod.PUT))
            .andRespond(withSuccess());
        creditServer.expect(requestTo("/api/credits/orders/order/hold-for-reopen"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andExpect(MockRestRequestMatchers.content().string(""))
                .andRespond(withSuccess());

        adapters.validatePair("p", "d", null);
        adapters.reserve("order", "requester", 2, null);
        adapters.holdForReopen("order", null);
        supplierServer.verify();
        creditServer.verify();
    }

    @Test
    void assignsCourierWithOrderAndCourierIdsAndWaitsForOk() {
        RestClient.Builder creditBuilder = RestClient.builder();
        MockRestServiceServer creditServer = MockRestServiceServer.bindTo(creditBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(),
                RestClient.builder().build(),
                creditBuilder.build());
        creditServer.expect(requestTo("/api/credits/orders/order-1/courier-assignment"))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andExpect(header("Authorization", "Bearer courier-token"))
                .andExpect(content().json("{\"courierId\":\"courier-1\"}"))
                .andRespond(withSuccess());

        adapters.assignCourier(
                "order-1", "courier-1", "Bearer courier-token");

        creditServer.verify();
    }

    @Test
    void rejectsCreditAssignmentWhenCreditDoesNotReturnOk() {
        RestClient.Builder creditBuilder = RestClient.builder();
        MockRestServiceServer creditServer = MockRestServiceServer.bindTo(creditBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(),
                RestClient.builder().build(),
                creditBuilder.build());
        creditServer.expect(requestTo("/api/credits/orders/order-1/courier-assignment"))
                .andRespond(withStatus(org.springframework.http.HttpStatus.ACCEPTED));

        assertThrows(OrderProblem.class, () -> adapters.assignCourier(
                "order-1", "courier-1", "Bearer courier-token"));

        creditServer.verify();
    }

    @Test
    void rejectsAcceptedButUnconfirmedCreditReopenHoldResponse() {
        RestClient.Builder creditBuilder = RestClient.builder();
        MockRestServiceServer creditServer = MockRestServiceServer.bindTo(creditBuilder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(
                RestClient.builder().build(),
                RestClient.builder().build(),
                creditBuilder.build());
        creditServer.expect(requestTo("/api/credits/orders/order/hold-for-reopen"))
                .andExpect(method(org.springframework.http.HttpMethod.POST))
                .andRespond(withStatus(org.springframework.http.HttpStatus.ACCEPTED));

        assertThrows(OrderProblem.class, () -> adapters.holdForReopen(
                "order", "Bearer token"));

        creditServer.verify();
    }

    @Test
    void rejectsInvalidSupplierPairEvenWhenSupplierReturns200() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(RestClient.builder().build(),
                builder.build(), RestClient.builder().build());
        server.expect(requestTo("/api/suppliers/validate"))
                .andExpect(header("Authorization", "Bearer token"))
                .andExpect(content().json("{\"pickupSupplierId\":\"p\",\"deliverySupplierId\":\"d\"}"))
                .andRespond(withSuccess("{\"valid\":false,\"problems\":[{\"field\":\"pickupSupplierId\",\"supplierId\":\"p\",\"reason\":\"INACTIVE\"}]}",
                        MediaType.APPLICATION_JSON));

        OrderProblem problem = assertThrows(OrderProblem.class, () -> adapters.validatePair("p", "d", "Bearer token"));
        assertEquals("VALIDATION_ERROR", problem.getCode());
        server.verify();
    }

    @Test
    void missingSupplierValidationConfirmationFailsClosed() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        HttpPeerAdapters adapters = new HttpPeerAdapters(RestClient.builder().build(),
                builder.build(), RestClient.builder().build());
        server.expect(requestTo("/api/suppliers/validate")).andRespond(withSuccess());
        server.expect(requestTo("/api/suppliers/validate"))
                .andRespond(withSuccess("{\"problems\":[]}", MediaType.APPLICATION_JSON));

        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class,
                () -> adapters.validatePair("p", "d", null)).getCode());
        assertEquals("SERVICE_UNAVAILABLE", assertThrows(OrderProblem.class,
                () -> adapters.validatePair("p", "d", null)).getCode());
        server.verify();
    }
}
