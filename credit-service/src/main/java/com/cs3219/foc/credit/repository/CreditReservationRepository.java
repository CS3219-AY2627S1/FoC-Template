package com.cs3219.foc.credit.repository;

import com.cs3219.foc.credit.model.entity.CreditReservation;
import com.cs3219.foc.credit.model.entity.ReservationState;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface CreditReservationRepository extends JpaRepository<CreditReservation, UUID> {
    @Query(value = "SELECT * FROM credit_reservations WHERE errand_id = :errand FOR UPDATE", nativeQuery = true)
    Optional<CreditReservation> lockByErrandId(@Param("errand") UUID errand);

    @Modifying
    @Query(
            value =
                    "UPDATE credit_reservations SET state = :#{#state.name()}, courier_id = :courier, settled_at = CURRENT_TIMESTAMP WHERE errand_id = :errand",
            nativeQuery = true)
    int settle(@Param("errand") UUID errand, @Param("state") ReservationState state, @Param("courier") UUID courier);

    @Modifying
    @Query(value = """
        INSERT INTO credit_reservations(errand_id, operation_id, user_id, amount, state, settled_at)
        VALUES (:errand, :operation, :user, :amount, :#{#state.name()},
                CASE WHEN :#{#state.name()} = 'INSUFFICIENT_BALANCE' THEN CURRENT_TIMESTAMP ELSE NULL END)
        ON CONFLICT DO NOTHING
        """, nativeQuery = true)
    int reserve(
            @Param("errand") UUID errand,
            @Param("operation") UUID operation,
            @Param("user") UUID user,
            @Param("amount") long amount,
            @Param("state") ReservationState state);
}
