package com.cs3219.foc.credit.repository;

import com.cs3219.foc.credit.model.dto.CreditBalanceResponse;
import com.cs3219.foc.credit.model.entity.CreditAccount;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CreditAccountRepository extends JpaRepository<CreditAccount, UUID> {
    @Query(value = "SELECT * FROM credit_accounts WHERE user_id = :userId FOR UPDATE", nativeQuery = true)
    Optional<CreditAccount> lockByUserId(@Param("userId") UUID userId);

    @Query("""
            SELECT new com.cs3219.foc.credit.model.dto.CreditBalanceResponse(
                a.totalBalance - COALESCE(SUM(r.amount), 0), COALESCE(SUM(r.amount), 0))
            FROM CreditAccount a
            LEFT JOIN CreditReservation r ON r.userId = a.userId
                AND r.state = com.cs3219.foc.credit.model.entity.ReservationState.RESERVED
            WHERE a.userId = :userId
            GROUP BY a.userId, a.totalBalance
            """)
    Optional<CreditBalanceResponse> findBalanceByUserId(@Param("userId") UUID userId);

    @Modifying
    @Query(
            value =
                    "UPDATE credit_accounts SET total_balance = total_balance - :amount, updated_at = CURRENT_TIMESTAMP WHERE user_id = :userId",
            nativeQuery = true)
    int debitTotal(@Param("userId") UUID userId, @Param("amount") long amount);

    @Modifying
    @Query(
            value =
                    "UPDATE credit_accounts SET total_balance = total_balance + :amount, updated_at = CURRENT_TIMESTAMP WHERE user_id = :userId",
            nativeQuery = true)
    int creditTotal(@Param("userId") UUID userId, @Param("amount") long amount);

    @Modifying
    @Query(value = """
                    INSERT INTO credit_accounts (user_id, total_balance)
                    VALUES (:userId, :initialAllocation)
                    ON CONFLICT (user_id) DO NOTHING
                    """, nativeQuery = true)
    int initializeIfAbsent(@Param("userId") UUID userId, @Param("initialAllocation") long initialAllocation);
}
