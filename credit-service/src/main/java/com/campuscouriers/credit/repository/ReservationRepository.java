/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-20
 * Scope (AI-61): Generated the ReservationRepository interface, including methods to find reservations by reservationId and orderId with optional pessimistic locking.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.repository;

import com.campuscouriers.credit.entity.Reservation;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface ReservationRepository extends JpaRepository<Reservation, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Reservation> findWithLockByReservationId(UUID reservationId);

    Optional<Reservation> findByOrderId(UUID orderId);
}