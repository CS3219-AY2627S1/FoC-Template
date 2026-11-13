/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Code generation.
 * Scope: Generated credit command table JPA repository based on the agreed contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;

interface CreditCommandJpaRepository extends JpaRepository<CreditCommandRecordEntity, String> {

    @Modifying
    @Query(value = """
            insert into credit_command_records
                (command_id, operation, actor_id, order_id, amount, payload_hash,
                 highest_generation, outcome, code, created_at, updated_at)
            values (:commandId, :#{#operation.name()}, :actorId, :orderId, :amount, :payloadHash,
                    :generation, 'PENDING', 'PENDING', :now, :now)
            on conflict (command_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(@Param("commandId") String commandId,
                       @Param("operation") CreditCommandOperation operation,
                       @Param("actorId") String actorId,
                       @Param("orderId") String orderId,
                       @Param("amount") Long amount,
                       @Param("payloadHash") String payloadHash,
                       @Param("generation") long generation,
                       @Param("now") Instant now);

    @Modifying
    @Query(value = """
            insert into credit_command_records
                (command_id, operation, actor_id, order_id, amount, payload_hash,
                 highest_generation, outcome, code, created_at, updated_at, completed_at)
            values (:commandId, :#{#operation.name()}, :actorId, :orderId, :amount, :payloadHash,
                    :generation, 'COMPENSATED', 'FENCED_NO_EFFECT', :now, :now, :now)
            on conflict (command_id) do nothing
            """, nativeQuery = true)
    int insertCompensatedIfAbsent(@Param("commandId") String commandId,
                                  @Param("operation") CreditCommandOperation operation,
                                  @Param("actorId") String actorId,
                                  @Param("orderId") String orderId,
                                  @Param("amount") Long amount,
                                  @Param("payloadHash") String payloadHash,
                                  @Param("generation") long generation,
                                  @Param("now") Instant now);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select command from CreditCommandRecordEntity command where command.commandId = :commandId")
    Optional<CreditCommandRecordEntity> findByCommandIdForUpdate(@Param("commandId") String commandId);
}
