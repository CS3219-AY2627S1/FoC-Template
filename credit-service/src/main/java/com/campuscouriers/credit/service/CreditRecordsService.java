/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-62): Implement the Credit Records Service logic class for the credit service, where credit records are made after every change in credit and a way to get the credit history of a user.
 * Author review: Code changes were checked and validated
 */



package com.campuscouriers.credit.service;

import com.campuscouriers.credit.entity.CreditRecords;
import com.campuscouriers.credit.entity.CreditRecordsType;
import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.event.CreditChangedEvent;
import com.campuscouriers.credit.event.CreditEventPublisher;
import com.campuscouriers.credit.repository.CreditRecordsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CreditRecordsService {

    private final CreditRecordsRepository creditRecordsRepository;
    private final CreditEventPublisher creditEventPublisher;
    private final WalletService walletService;

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordReserved(Wallet wallet, UUID orderId, long amount) {
        save(wallet, orderId, CreditRecordsType.RESERVED, -amount, amount, null);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordReleased(Wallet wallet, UUID orderId, long amount) {
        save(wallet, orderId, CreditRecordsType.RELEASED, amount, -amount, null);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordTransferred(Wallet requesterWallet, Wallet courierWallet, UUID orderId, long amount) {
        save(requesterWallet, orderId, CreditRecordsType.TRANSFERRED, 0, -amount, courierWallet);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordReceived(Wallet courierWallet, Wallet requesterWallet, UUID orderId, long amount) {
        save(courierWallet, orderId, CreditRecordsType.RECEIVED, amount, 0, requesterWallet);
    }

    @Transactional(readOnly = true)
    public Page<CreditRecords> getHistory(UUID userId, Pageable pageable) {
        Wallet wallet = walletService.getWalletByUser(userId);
        return creditRecordsRepository.findByWalletIdOrderByOccurredAtDesc(wallet.getWalletId(), pageable);
    }

    private void save(Wallet wallet, UUID orderId, CreditRecordsType type,
                      long availableDelta, long reserveDelta, Wallet counterparty) {
        CreditRecords record = creditRecordsRepository.save(new CreditRecords(
                wallet.getWalletId(), orderId, type,
                availableDelta, reserveDelta,
                wallet.getAvailableBalance(), wallet.getReserveBalance(),
                counterparty == null ? null : counterparty.getWalletId()));

        String text = type.name();   
        creditEventPublisher.publishCreditChanged(
            CreditChangedEvent.topicFor(text),
            CreditChangedEvent.from(record, wallet, counterparty));
    }
}