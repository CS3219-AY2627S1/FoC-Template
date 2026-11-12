/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-62): Generated unit tests for CreditRecordsService
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.service;

import com.campuscouriers.credit.entity.CreditRecords;
import com.campuscouriers.credit.entity.CreditRecordsType;
import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.entity.WalletStatus;
import com.campuscouriers.credit.event.CreditChangedEvent;
import com.campuscouriers.credit.event.CreditEventPublisher;
import com.campuscouriers.credit.repository.CreditRecordsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CreditRecordsServiceTests {

    private CreditRecordsRepository creditRecordsRepository;
    private CreditEventPublisher creditEventPublisher;
    private WalletService walletService;
    private CreditRecordsService creditRecordsService;

    @BeforeEach
    void setUp() {
        creditRecordsRepository = mock(CreditRecordsRepository.class);
        creditEventPublisher = mock(CreditEventPublisher.class);
        walletService = mock(WalletService.class);
        creditRecordsService = new CreditRecordsService(creditRecordsRepository, creditEventPublisher, walletService);
        when(creditRecordsRepository.save(any(CreditRecords.class))).thenAnswer(invocation -> {
            CreditRecords saved = invocation.getArgument(0);
            ReflectionTestUtils.setField(saved, "creditRecordId", UUID.randomUUID());
            return saved;
        });
    }

    private static Wallet wallet(long available, long reserved) {
        Wallet wallet = new Wallet(UUID.randomUUID(), available, WalletStatus.ACTIVE);
        wallet.setReserveBalance(reserved);
        ReflectionTestUtils.setField(wallet, "walletId", UUID.randomUUID());
        return wallet;
    }

    private CreditRecords savedRecord() {
        ArgumentCaptor<CreditRecords> captor = ArgumentCaptor.forClass(CreditRecords.class);
        verify(creditRecordsRepository).save(captor.capture());
        return captor.getValue();
    }

    private CreditChangedEvent publishedEvent(String expectedTopic) {
        ArgumentCaptor<CreditChangedEvent> captor = ArgumentCaptor.forClass(CreditChangedEvent.class);
        verify(creditEventPublisher).publishCreditChanged(eq(expectedTopic), captor.capture());
        return captor.getValue();
    }

    @Test
    void recordReservedStoresNegativeAvailableAndPositiveReserveDelta() {
        // Balances are already updated when the record is written.
        Wallet requester = wallet(20, 10);
        UUID orderId = UUID.randomUUID();

        creditRecordsService.recordReserved(requester, orderId, 10);

        CreditRecords record = savedRecord();
        assertThat(record.getWalletId()).isEqualTo(requester.getWalletId());
        assertThat(record.getOrderId()).isEqualTo(orderId);
        assertThat(record.getType()).isEqualTo(CreditRecordsType.RESERVED);
        assertThat(record.getAvailableDelta()).isEqualTo(-10);
        assertThat(record.getReserveDelta()).isEqualTo(10);
        assertThat(record.getAvailableBalanceAfter()).isEqualTo(20);
        assertThat(record.getReserveBalanceAfter()).isEqualTo(10);
        assertThat(record.getCounterpartyWalletId()).isNull();
        assertThat(record.getOccurredAt()).isNotNull();

        CreditChangedEvent event = publishedEvent(CreditChangedEvent.RESERVED);
        assertThat(event.creditRecordId()).isEqualTo(record.getCreditRecordId());
        assertThat(event.changeType()).isEqualTo("RESERVED");
        assertThat(event.userId()).isEqualTo(requester.getUserUuid());
        assertThat(event.counterpartyUserId()).isNull();
        assertThat(event.amount()).isEqualTo(-10);
        assertThat(event.reserveAmount()).isEqualTo(10);
        assertThat(event.availableBalanceAfter()).isEqualTo(20);
    }

    @Test
    void recordReleasedStoresPositiveAvailableAndNegativeReserveDelta() {
        Wallet requester = wallet(30, 0);

        creditRecordsService.recordReleased(requester, UUID.randomUUID(), 10);

        CreditRecords record = savedRecord();
        assertThat(record.getType()).isEqualTo(CreditRecordsType.RELEASED);
        assertThat(record.getAvailableDelta()).isEqualTo(10);
        assertThat(record.getReserveDelta()).isEqualTo(-10);
        assertThat(record.getAvailableBalanceAfter()).isEqualTo(30);
        publishedEvent(CreditChangedEvent.RELEASED);
    }

    @Test
    void recordTransferredOnlyReducesRequesterReserveAndNamesCourier() {
        Wallet requester = wallet(20, 0);
        Wallet courier = wallet(15, 0);

        creditRecordsService.recordTransferred(requester, courier, UUID.randomUUID(), 10);

        CreditRecords record = savedRecord();
        assertThat(record.getType()).isEqualTo(CreditRecordsType.TRANSFERRED);
        assertThat(record.getWalletId()).isEqualTo(requester.getWalletId());
        assertThat(record.getAvailableDelta()).isZero();
        assertThat(record.getReserveDelta()).isEqualTo(-10);
        assertThat(record.getCounterpartyWalletId()).isEqualTo(courier.getWalletId());

        CreditChangedEvent event = publishedEvent(CreditChangedEvent.TRANSFERRED);
        assertThat(event.userId()).isEqualTo(requester.getUserUuid());
        assertThat(event.counterpartyUserId()).isEqualTo(courier.getUserUuid());
    }

    @Test
    void recordReceivedAddsToCourierAvailableAndNamesRequester() {
        Wallet courier = wallet(15, 0);
        Wallet requester = wallet(20, 0);

        creditRecordsService.recordReceived(courier, requester, UUID.randomUUID(), 10);

        CreditRecords record = savedRecord();
        assertThat(record.getType()).isEqualTo(CreditRecordsType.RECEIVED);
        assertThat(record.getWalletId()).isEqualTo(courier.getWalletId());
        assertThat(record.getAvailableDelta()).isEqualTo(10);
        assertThat(record.getReserveDelta()).isZero();
        assertThat(record.getAvailableBalanceAfter()).isEqualTo(15);
        assertThat(record.getCounterpartyWalletId()).isEqualTo(requester.getWalletId());

        CreditChangedEvent event = publishedEvent(CreditChangedEvent.RECEIVED);
        assertThat(event.userId()).isEqualTo(courier.getUserUuid());
        assertThat(event.counterpartyUserId()).isEqualTo(requester.getUserUuid());
    }

    @Test
    void getHistoryLooksUpTheUsersWalletAndPagesItsRecords() {
        Wallet wallet = wallet(30, 0);
        UUID userId = wallet.getUserUuid();
        Pageable pageable = PageRequest.of(1, 5);
        Page<CreditRecords> page = new PageImpl<>(List.of(), pageable, 0);
        when(walletService.getWalletByUser(userId)).thenReturn(wallet);
        when(creditRecordsRepository.findByWalletIdOrderByOccurredAtDesc(wallet.getWalletId(), pageable))
                .thenReturn(page);

        assertThat(creditRecordsService.getHistory(userId, pageable)).isSameAs(page);
    }
}
