/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Define API endpoints for credit reservations, including reserve, adjust, release, and complete operations. Implement access control based on JWT authentication and service key validation.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.controller;

import com.campuscouriers.credit.dto.CompleteReservationRequest;
import com.campuscouriers.credit.dto.AdjustReservationRequest;
import com.campuscouriers.credit.dto.ReserveCreditsRequest;
import com.campuscouriers.credit.dto.ReservationResponse;
import com.campuscouriers.credit.service.ReservationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.beans.factory.annotation.Value;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import java.util.UUID;

@RestController
@RequestMapping("/api/reservations")
public class ReservationController {

    private final ReservationService reservationService;

    @Value("${credit.order-service-key:}")
    private String orderServiceKey;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ReservationResponse reserve(@Valid @RequestBody ReserveCreditsRequest request,
                                       @AuthenticationPrincipal Jwt jwt,
                                       @RequestHeader(value = "X-Order-Service-Key", required = false) String key) {
        requireOrderService(key);
        if (!request.userId().equals(callerId(jwt))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Cannot reserve another user's credits");
        }
        return reservationService.reserveCredits(request.userId(), request.orderId(), request.amount());
    }

    @PutMapping("/{reservationId}")
    public ReservationResponse adjust(@PathVariable UUID reservationId,
                                      @Valid @RequestBody AdjustReservationRequest request,
                                      @AuthenticationPrincipal Jwt jwt,
                                      @RequestHeader(value = "X-Order-Service-Key", required = false) String key) {
        requireOrderService(key);
        reservationService.assertOwnedBy(reservationId, callerId(jwt));
        return reservationService.adjustReservation(reservationId, request.newAmount());
    }

    @PostMapping("/{reservationId}/release")
    public ReservationResponse release(@PathVariable UUID reservationId, @AuthenticationPrincipal Jwt jwt,
                                      @RequestHeader(value = "X-Order-Service-Key", required = false) String key) {
        requireOrderService(key);
        reservationService.assertOwnedBy(reservationId, callerId(jwt));
        return reservationService.releaseReservation(reservationId);
    }

    @PostMapping("/{reservationId}/complete")
    public ReservationResponse complete(@PathVariable UUID reservationId,
                                        @Valid @RequestBody CompleteReservationRequest request,
                                        @AuthenticationPrincipal Jwt jwt,
                                        @RequestHeader(value = "X-Order-Service-Key", required = false) String key) {
        requireOrderService(key);
        reservationService.assertOwnedBy(reservationId, callerId(jwt));
        return reservationService.completeReservation(reservationId, request.courierUserId(), request.orderId());
    }

    private UUID callerId(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user ID in access token");
        }
    }

    private void requireOrderService(String key) {
        if (orderServiceKey == null || orderServiceKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Service credentials not configured");
        }
        if (key == null || !MessageDigest.isEqual(orderServiceKey.getBytes(StandardCharsets.UTF_8), key.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Order Service credentials required");
        }
    }
}
