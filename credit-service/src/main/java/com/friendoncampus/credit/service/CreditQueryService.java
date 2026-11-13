package com.friendoncampus.credit.service;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;

@Service
public class CreditQueryService {

    private static final int MAX_PAGE_SIZE = 100;

    private final CreditAccountRepository accounts;
    private final CreditLedgerEntryRepository ledger;

    public CreditQueryService(CreditAccountRepository accounts, CreditLedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.ledger = ledger;
    }

    @Transactional(readOnly = true)
    public CreditAccount balance(UUID userId) {
        return accounts.findById(userId)
                .orElseThrow(() -> new CreditAccountNotFoundException(userId));
    }

    @Transactional(readOnly = true)
    public Page<CreditLedgerEntry> transactions(UUID userId, int page, int size) {
        if (page < 0) {
            throw new IllegalArgumentException("Page must be zero or greater");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw new IllegalArgumentException("Page size must be between 1 and 100");
        }
        balance(userId);
        PageRequest request = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        return ledger.findByAccountId(userId, request);
    }
}
