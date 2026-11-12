/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-61): Generated tests for reservation-related endpoints and validation of service key and user ownership.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.controller;

import com.campuscouriers.credit.dto.AdjustReservationRequest;
import com.campuscouriers.credit.dto.CompleteReservationRequest;
import com.campuscouriers.credit.dto.ReserveCreditsRequest;
import com.campuscouriers.credit.service.ReservationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Who may call the reservation endpoints: only Order Service (shared key), acting for the user in the token,
 * and only on that user's own reservations.
 */
class ReservationControllerTests {

    private static final String SERVICE_KEY = "backend-secret";

    private ReservationService service;
    private ReservationController controller;
    private final UUID user = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = mock(ReservationService.class);
        controller = new ReservationController(service);
        ReflectionTestUtils.setField(controller, "orderServiceKey", SERVICE_KEY);
    }

    private static Jwt token(String subject) {
        return Jwt.withTokenValue("test").header("alg", "RS256").subject(subject).build();
    }

    private Jwt token() {
        return token(user.toString());
    }

    private static int status(Executable call) {
        return assertThrows(ResponseStatusException.class, call).getStatusCode().value();
    }

    @Test
    void missingServiceKeyConfigurationFailsClosed() {
        ReflectionTestUtils.setField(controller, "orderServiceKey", "");
        var request = new ReserveCreditsRequest(user, UUID.randomUUID(), 10);

        assertThat(status(() -> controller.reserve(request, token(), "anything"))).isEqualTo(503);
        verifyNoInteractions(service);
    }

    @Test
    void userTokenWithoutServiceKeyCannotReserve() {
        var request = new ReserveCreditsRequest(user, UUID.randomUUID(), 10);

        assertThat(status(() -> controller.reserve(request, token(), null))).isEqualTo(403);
        verifyNoInteractions(service);
    }

    @Test
    void wrongServiceKeyIsRejected() {
        var request = new ReserveCreditsRequest(user, UUID.randomUUID(), 10);

        assertThat(status(() -> controller.reserve(request, token(), "backend-secreT"))).isEqualTo(403);
        verifyNoInteractions(service);
    }

    @Test
    void serviceKeyDoesNotAllowReservingAnotherUsersCredits() {
        var request = new ReserveCreditsRequest(UUID.randomUUID(), UUID.randomUUID(), 10);

        assertThat(status(() -> controller.reserve(request, token(), SERVICE_KEY))).isEqualTo(403);
        verifyNoInteractions(service);
    }

    @Test
    void tokenWithoutUuidSubjectIsUnauthorized() {
        var request = new ReserveCreditsRequest(user, UUID.randomUUID(), 10);

        assertThat(status(() -> controller.reserve(request, token("not-a-uuid"), SERVICE_KEY))).isEqualTo(401);
        verifyNoInteractions(service);
    }

    @Test
    void validReservationIsForwardedWithItsOrderId() {
        UUID order = UUID.randomUUID();

        controller.reserve(new ReserveCreditsRequest(user, order, 10), token(), SERVICE_KEY);

        verify(service).reserveCredits(user, order, 10);
    }

    @Test
    void adjustChecksOwnershipBeforeChangingAmount() {
        UUID reservation = UUID.randomUUID();

        controller.adjust(reservation, new AdjustReservationRequest(15), token(), SERVICE_KEY);

        var calls = inOrder(service);
        calls.verify(service).assertOwnedBy(reservation, user);
        calls.verify(service).adjustReservation(reservation, 15);
    }

    @Test
    void releaseChecksOwnershipBeforeReleasing() {
        UUID reservation = UUID.randomUUID();

        controller.release(reservation, token(), SERVICE_KEY);

        var calls = inOrder(service);
        calls.verify(service).assertOwnedBy(reservation, user);
        calls.verify(service).releaseReservation(reservation);
    }

    @Test
    void completeChecksOwnershipAndForwardsCourierAndOrder() {
        UUID reservation = UUID.randomUUID(), order = UUID.randomUUID(), courier = UUID.randomUUID();

        controller.complete(reservation, new CompleteReservationRequest(courier, order), token(), SERVICE_KEY);

        var calls = inOrder(service);
        calls.verify(service).assertOwnedBy(reservation, user);
        calls.verify(service).completeReservation(reservation, courier, order);
    }

    @Test
    void notOwnerCannotReleaseSomeoneElsesReservation() {
        UUID reservation = UUID.randomUUID();
        doThrow(new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN))
                .when(service).assertOwnedBy(reservation, user);

        assertThat(status(() -> controller.release(reservation, token(), SERVICE_KEY))).isEqualTo(403);
        verify(service, never()).releaseReservation(reservation);
    }

    @Test
    void mutatingEndpointsAllRequireServiceKey() {
        UUID reservation = UUID.randomUUID();

        assertThat(status(() -> controller.adjust(reservation, new AdjustReservationRequest(5), token(), null)))
                .isEqualTo(403);
        assertThat(status(() -> controller.release(reservation, token(), null))).isEqualTo(403);
        assertThat(status(() -> controller.complete(reservation,
                new CompleteReservationRequest(UUID.randomUUID(), UUID.randomUUID()), token(), null)))
                .isEqualTo(403);
        verifyNoInteractions(service);
    }
}
