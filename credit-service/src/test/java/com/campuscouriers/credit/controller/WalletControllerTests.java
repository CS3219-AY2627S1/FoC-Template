/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-61): Generated tests for wallet-related endpoints, including validation of JWT tokens and retrieval of wallet balance and transaction history.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.controller;

import com.campuscouriers.credit.dto.CreditRecordsResponse;
import com.campuscouriers.credit.entity.CreditRecords;
import com.campuscouriers.credit.entity.CreditRecordsType;
import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.entity.WalletStatus;
import com.campuscouriers.credit.service.CreditRecordsService;
import com.campuscouriers.credit.service.WalletService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class WalletControllerTests {

    private WalletService walletService;
    private CreditRecordsService creditRecordsService;
    private WalletController controller;

    @BeforeEach
    void setUp() {
        walletService = mock(WalletService.class);
        creditRecordsService = mock(CreditRecordsService.class);
        controller = new WalletController(walletService, creditRecordsService);
    }

    private static Jwt token(String subject) {
        return Jwt.withTokenValue("test").header("alg", "RS256").subject(subject).build();
    }

    @Test
    void availableBalanceIsReadFromTheCallersWallet() {
        UUID userId = UUID.randomUUID();
        Wallet wallet = new Wallet(userId, 27, WalletStatus.ACTIVE);
        wallet.setReserveBalance(3);
        when(walletService.getWalletByUser(userId)).thenReturn(wallet);

        assertThat(controller.getMyWallet(token(userId.toString())).availableBalance()).isEqualTo(27);
    }

    @Test
    void availableBalanceRejectsTokenWithoutUuidSubject() {
        assertThatThrownBy(() -> controller.getMyWallet(token("not-a-uuid")))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(401));
        verifyNoInteractions(walletService);
    }

    @Test
    void transactionHistoryReturnsTheCallersRecordsAsResponses() {
        UUID userId = UUID.randomUUID();
        Pageable pageable = PageRequest.of(0, 20);
        CreditRecords record = new CreditRecords(
                UUID.randomUUID(), UUID.randomUUID(), CreditRecordsType.RESERVED, -10, 10, 20, 10, null);
        when(creditRecordsService.getHistory(userId, pageable))
                .thenReturn(new PageImpl<>(List.of(record), pageable, 1));

        Page<CreditRecordsResponse> page = controller.getTransactionHistory(token(userId.toString()), pageable);

        assertThat(page.getTotalElements()).isEqualTo(1);
        assertThat(page.getContent()).singleElement().satisfies(response -> {
            assertThat(response.type()).isEqualTo("RESERVED");
            assertThat(response.amount()).isEqualTo(-10);
            assertThat(response.balanceAfter()).isEqualTo(20);
        });
    }

    @Test
    void transactionHistoryRejectsTokenWithoutUuidSubject() {
        assertThatThrownBy(() -> controller.getTransactionHistory(token("admin"), PageRequest.of(0, 20)))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        error -> assertThat(error.getStatusCode().value()).isEqualTo(401));
        verifyNoInteractions(creditRecordsService);
    }
}
