/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-11-10
 * Scope (AI-28): Generated the account list endpoint, admin users page and their tests.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.repository;

import com.campuscouriers.user.account.dto.AccountSummaryResponse;
import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.AccountType;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    boolean existsByEmail(String email);
    Optional<Account> findByEmail(String email);
    boolean existsByType(AccountType type);

    // Accounts with their profile name, for the administrator account list. pattern is a lower-case
    // LIKE pattern matched against the email and the name; "!" escapes literal % and _ in it.
    // Profile has no back-reference from Account, so it is joined explicitly (left join: no profile = null name)
    @Query(value = """
            select new com.campuscouriers.user.account.dto.AccountSummaryResponse(a.id, a.email, p.name, a.type)
            from Account a left join Profile p on p.account = a
            where a.type in :types
              and (lower(a.email) like :pattern escape '!' or lower(coalesce(p.name, '')) like :pattern escape '!')
            order by lower(a.email), a.id
            """,
            countQuery = """
            select count(a)
            from Account a left join Profile p on p.account = a
            where a.type in :types
              and (lower(a.email) like :pattern escape '!' or lower(coalesce(p.name, '')) like :pattern escape '!')
            """)
    Page<AccountSummaryResponse> searchSummaries(@Param("pattern") String pattern,
                                                 @Param("types") Collection<AccountType> types,
                                                 Pageable pageable);

    // SELECT ... ORDER BY id FOR UPDATE: rows are locked in ascending id order, so concurrent callers serialize
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select a from Account a where a.type = :type or a.id = :id order by a.id")
    List<Account> lockAllByTypeOrId(@Param("type") AccountType type, @Param("id") UUID id);

    // Blocks until this transaction holds the PostgreSQL advisory lock for the key; released on commit or rollback.
    // Selected FROM the function because pg_advisory_xact_lock returns void, which JDBC cannot map
    @Query(value = "select 1 from pg_advisory_xact_lock(:key)", nativeQuery = true)
    Integer acquireTransactionLock(@Param("key") long key);

}
