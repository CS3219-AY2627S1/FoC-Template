/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA credit ledger repository based on the provided PostgreSQL requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;

interface CreditLedgerJpaRepository extends JpaRepository<CreditLedgerEntity, UUID> {
    @Query("""
            select entry from CreditLedgerEntity entry
            where entry.userId = :userId
              and (entry.commandId is null or not exists (
                  select command.commandId from CreditCommandRecordEntity command
                  where command.commandId = entry.commandId
                    and command.operation = :operation
                    and command.outcome = :outcome
                    and command.code = :code
              ))
            """)
    Page<CreditLedgerEntity> findUserVisibleByUserId(
            @Param("userId") String userId,
            @Param("operation") CreditCommandOperation operation,
            @Param("outcome") CreditCommandOutcome outcome,
            @Param("code") String code,
            Pageable pageable);

    @Query("""
            select entry from CreditLedgerEntity entry
            where entry.commandId is null or not exists (
                select command.commandId from CreditCommandRecordEntity command
                where command.commandId = entry.commandId
                  and command.operation = :operation
                  and command.outcome = :outcome
                  and command.code = :code
            )
            """)
    Page<CreditLedgerEntity> findAllUserVisible(
            @Param("operation") CreditCommandOperation operation,
            @Param("outcome") CreditCommandOutcome outcome,
            @Param("code") String code,
            Pageable pageable);
}
