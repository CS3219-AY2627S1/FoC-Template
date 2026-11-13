/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA reservation repository based on the provided PostgreSQL requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Lock;
import jakarta.persistence.LockModeType;
import java.util.Optional;

interface CreditReservationJpaRepository extends JpaRepository<CreditReservationEntity, String> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select reservation from CreditReservationEntity reservation where reservation.orderId = :orderId")
    Optional<CreditReservationEntity> findByOrderIdForUpdate(@Param("orderId") String orderId);

    @Modifying
    @Query(value = """
            insert into credit_reservations
                (order_id, requester_id, amount, status, created_at, updated_at, reserve_command_id,
                 mutation_revision, last_mutation_identity)
            values (:orderId, :requesterId, :amount, 'RESERVED', :createdAt, :createdAt, :commandId,
                    1, :mutationIdentity)
            on conflict (order_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("orderId") String orderId,
                       @Param("requesterId") String requesterId,
                       @Param("amount") long amount,
                       @Param("commandId") String commandId,
                       @Param("mutationIdentity") String mutationIdentity,
                       @Param("createdAt") Instant createdAt);
}
