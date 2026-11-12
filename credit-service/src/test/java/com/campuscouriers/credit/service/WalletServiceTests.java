/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-10
 * Scope (AI-61): Generated unit tests for WalletService, including scenarios for creating wallets, reserving and releasing credits, and transferring balances.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.service;

import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.entity.WalletStatus;
import com.campuscouriers.credit.exception.IllegalReservedStateException;
import com.campuscouriers.credit.exception.IllegalUUIDNullException;
import com.campuscouriers.credit.exception.InsufficientCreditsException;
import com.campuscouriers.credit.exception.WalletNotFoundException;
import com.campuscouriers.credit.exception.WalletSuspendedException;
import com.campuscouriers.credit.repository.WalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class WalletServiceTests {

    private WalletRepository walletRepository;
    private WalletService walletService;

    @BeforeEach
    void setUp() {
        walletRepository = mock(WalletRepository.class);
        walletService = new WalletService(walletRepository);
        ReflectionTestUtils.setField(walletService, "defaultCredits", 30L);
        when(walletRepository.save(any(Wallet.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private static Wallet wallet(long available, long reserved, WalletStatus status) {
        Wallet wallet = new Wallet(UUID.randomUUID(), available, status);
        wallet.setReserveBalance(reserved);
        return wallet;
    }

    @Nested
    class CreateWallet {

        @Test
        void rejectsNullUserId() {
            assertThatThrownBy(() -> walletService.createWallet(null))
                    .isInstanceOf(IllegalUUIDNullException.class);
            verify(walletRepository, never()).save(any());
        }

        @Test
        void createsActiveWalletWithDefaultCredits() {
            UUID userId = UUID.randomUUID();
            when(walletRepository.findByUserUuid(userId)).thenReturn(Optional.empty());

            Wallet created = walletService.createWallet(userId);

            assertThat(created.getUserUuid()).isEqualTo(userId);
            assertThat(created.getAvailableBalance()).isEqualTo(30);
            assertThat(created.getReserveBalance()).isZero();
            assertThat(created.getWalletStatus()).isEqualTo(WalletStatus.ACTIVE);
            verify(walletRepository).save(created);
        }

        @Test
        void returnsExistingWalletForRepeatedRegistrationEvent() {
            UUID userId = UUID.randomUUID();
            Wallet existing = new Wallet(userId, 12, WalletStatus.ACTIVE);
            when(walletRepository.findByUserUuid(userId)).thenReturn(Optional.of(existing));

            assertThat(walletService.createWallet(userId)).isSameAs(existing);
            verify(walletRepository, never()).save(any());
        }

        @Test
        void createsSuspendedEmptyWalletWhenDefaultCreditsAreMisconfigured() {
            ReflectionTestUtils.setField(walletService, "defaultCredits", -1L);
            UUID userId = UUID.randomUUID();
            when(walletRepository.findByUserUuid(userId)).thenReturn(Optional.empty());

            Wallet created = walletService.createWallet(userId);

            assertThat(created.getAvailableBalance()).isZero();
            assertThat(created.getWalletStatus()).isEqualTo(WalletStatus.SUSPENDED);
        }
    }

    @Nested
    class GetWalletByUser {

        @Test
        void returnsTheUsersWallet() {
            UUID userId = UUID.randomUUID();
            Wallet existing = new Wallet(userId, 5, WalletStatus.ACTIVE);
            when(walletRepository.findByUserUuid(userId)).thenReturn(Optional.of(existing));

            assertThat(walletService.getWalletByUser(userId)).isSameAs(existing);
        }

        @Test
        void throwsWhenUserHasNoWallet() {
            when(walletRepository.findByUserUuid(any())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> walletService.getWalletByUser(UUID.randomUUID()))
                    .isInstanceOf(WalletNotFoundException.class);
        }
    }

    @Nested
    class Reserve {

        @Test
        void movesCreditsFromAvailableToReserved() {
            Wallet wallet = wallet(30, 0, WalletStatus.ACTIVE);

            walletService.reserve(wallet, 10);

            assertThat(wallet.getAvailableBalance()).isEqualTo(20);
            assertThat(wallet.getReserveBalance()).isEqualTo(10);
        }

        @Test
        void allowsReservingTheWholeAvailableBalance() {
            Wallet wallet = wallet(10, 0, WalletStatus.ACTIVE);

            walletService.reserve(wallet, 10);

            assertThat(wallet.getAvailableBalance()).isZero();
            assertThat(wallet.getReserveBalance()).isEqualTo(10);
        }

        @Test
        void rejectsAmountAboveAvailableBalance() {
            Wallet wallet = wallet(5, 0, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.reserve(wallet, 6))
                    .isInstanceOf(InsufficientCreditsException.class)
                    .hasMessageContaining("5")
                    .hasMessageContaining("6");
            assertThat(wallet.getAvailableBalance()).isEqualTo(5);
            assertThat(wallet.getReserveBalance()).isZero();
        }

        @Test
        void rejectsSuspendedWallet() {
            Wallet wallet = wallet(30, 0, WalletStatus.SUSPENDED);

            assertThatThrownBy(() -> walletService.reserve(wallet, 1))
                    .isInstanceOf(WalletSuspendedException.class);
            assertThat(wallet.getAvailableBalance()).isEqualTo(30);
        }

        @ParameterizedTest
        @ValueSource(longs = {0, -1})
        void rejectsNonPositiveAmount(long amount) {
            Wallet wallet = wallet(30, 0, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.reserve(wallet, amount))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    class Release {

        @Test
        void movesCreditsFromReservedBackToAvailable() {
            Wallet wallet = wallet(20, 10, WalletStatus.ACTIVE);

            walletService.release(wallet, 4);

            assertThat(wallet.getAvailableBalance()).isEqualTo(24);
            assertThat(wallet.getReserveBalance()).isEqualTo(6);
        }

        @Test
        void worksForSuspendedWallet() {
            // A suspended user must still get held credits back when an errand is cancelled.
            Wallet wallet = wallet(0, 10, WalletStatus.SUSPENDED);

            walletService.release(wallet, 10);

            assertThat(wallet.getAvailableBalance()).isEqualTo(10);
            assertThat(wallet.getReserveBalance()).isZero();
        }

        @Test
        void rejectsReleasingMoreThanIsReserved() {
            Wallet wallet = wallet(20, 3, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.release(wallet, 4))
                    .isInstanceOf(IllegalReservedStateException.class);
            assertThat(wallet.getReserveBalance()).isEqualTo(3);
        }

        @ParameterizedTest
        @ValueSource(longs = {0, -5})
        void rejectsNonPositiveAmount(long amount) {
            Wallet wallet = wallet(20, 10, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.release(wallet, amount))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    class Transfer {

        @Test
        void deductFromReserveOnlyReducesReservedBalance() {
            Wallet wallet = wallet(20, 10, WalletStatus.ACTIVE);

            walletService.deductFromReserve(wallet, 10);

            assertThat(wallet.getReserveBalance()).isZero();
            assertThat(wallet.getAvailableBalance()).isEqualTo(20);
        }

        @Test
        void deductFromReserveRejectsMoreThanIsReserved() {
            Wallet wallet = wallet(20, 2, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.deductFromReserve(wallet, 3))
                    .isInstanceOf(IllegalReservedStateException.class);
        }

        @Test
        void transferToAvailableAddsCredits() {
            Wallet wallet = wallet(7, 0, WalletStatus.ACTIVE);

            walletService.transferToAvailable(wallet, 8);

            assertThat(wallet.getAvailableBalance()).isEqualTo(15);
        }

        @Test
        void transferToAvailableRejectsNonPositiveAmount() {
            Wallet wallet = wallet(7, 0, WalletStatus.ACTIVE);

            assertThatThrownBy(() -> walletService.transferToAvailable(wallet, 0))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
