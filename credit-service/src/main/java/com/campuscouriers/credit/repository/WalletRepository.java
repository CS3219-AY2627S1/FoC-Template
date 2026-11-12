/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-20
 * Scope (AI-61): Generated the WalletRepository interface, including methods to find wallets by userUuid and walletId with pessimistic locking.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.repository;

import com.campuscouriers.credit.entity.Wallet;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import java.util.Optional;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    Optional<Wallet> findByUserUuid(UUID userUuid);

    boolean existsByUserUuid(UUID userUuid);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Wallet> findWithLockByUserUuid(UUID userUuid);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<Wallet> findWithLockByWalletId(UUID walletId);
}