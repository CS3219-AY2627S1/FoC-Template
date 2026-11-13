package com.friendoncampus.credit.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.credit.domain.CreditReservation;

import jakarta.persistence.LockModeType;

public interface CreditReservationRepository extends JpaRepository<CreditReservation, UUID> {

    Optional<CreditReservation> findByOrderId(UUID orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select reservation from CreditReservation reservation where reservation.orderId = :orderId")
    Optional<CreditReservation> findByOrderIdForUpdate(@Param("orderId") UUID orderId);
}
