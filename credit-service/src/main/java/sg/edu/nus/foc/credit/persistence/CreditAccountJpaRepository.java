/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA account repository and PostgreSQL locking queries based on provided requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

interface CreditAccountJpaRepository extends JpaRepository<CreditAccountEntity, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from CreditAccountEntity account where account.userId = :userId")
    Optional<CreditAccountEntity> findByUserIdForUpdate(@Param("userId") String userId);

    @Modifying
    @Query(value = """
            insert into credit_accounts
                (user_id, total_balance, reserved_balance, created_at, updated_at)
            values (:userId, :totalBalance, 0, :createdAt, :createdAt)
            on conflict (user_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("userId") String userId,
                       @Param("totalBalance") long totalBalance,
                       @Param("createdAt") Instant createdAt);
}
