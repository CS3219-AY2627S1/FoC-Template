/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Generated the CreditRecordsRepository interface for the credit service to store and retrieve credit records from the database
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.repository;

import com.campuscouriers.credit.entity.CreditRecords;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CreditRecordsRepository extends JpaRepository<CreditRecords, UUID> {
    Page<CreditRecords> findByWalletIdOrderByOccurredAtDesc(UUID walletId, Pageable pageable);
}