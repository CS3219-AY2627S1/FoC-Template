package com.friendoncampus.credit.repository;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.friendoncampus.credit.domain.CreditAccount;

import jakarta.persistence.LockModeType;

public interface CreditAccountRepository extends JpaRepository<CreditAccount, UUID> {

    @Modifying
    @Query(value = "INSERT INTO credit_accounts (user_id) VALUES (:userId) ON CONFLICT (user_id) DO NOTHING", nativeQuery = true)
    int insertEmptyIfAbsent(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select account from CreditAccount account where account.userId = :userId")
    Optional<CreditAccount> findByUserIdForUpdate(@Param("userId") UUID userId);
}
