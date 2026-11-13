package com.friendoncampus.credit.repository;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.friendoncampus.credit.domain.CreditLedgerEntry;

public interface CreditLedgerEntryRepository extends JpaRepository<CreditLedgerEntry, UUID> {
    Page<CreditLedgerEntry> findByAccountId(UUID accountId, Pageable pageable);
}
