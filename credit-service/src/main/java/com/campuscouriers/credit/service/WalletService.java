/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Implement the Wallet Service logic for the credit service, including methods for managing user wallets and handling user's credits.
 * Author review: Code changes were checked and validated
*/

package com.campuscouriers.credit.service;

import com.campuscouriers.credit.entity.Wallet;
import com.campuscouriers.credit.entity.WalletStatus;
import com.campuscouriers.credit.exception.IllegalUUIDNullException;
import com.campuscouriers.credit.exception.InsufficientCreditsException;
import com.campuscouriers.credit.exception.WalletSuspendedException;
import com.campuscouriers.credit.exception.IllegalReservedStateException;
import com.campuscouriers.credit.exception.MisconfiguredCreditsException;
import com.campuscouriers.credit.exception.WalletNotFoundException;
import com.campuscouriers.credit.repository.WalletRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;




@Service
public class WalletService {

    private final WalletRepository walletRepository;

    @Value("${credit.wallet.default-credits}") 
    private long defaultCredits;

    public WalletService(WalletRepository walletRepository) {
        this.walletRepository = walletRepository;
    }

    @Transactional
    public Wallet createWallet(UUID userUuid) {
        if (userUuid == null) {
            throw new IllegalUUIDNullException();
        }

        return walletRepository.findByUserUuid(userUuid)
            .orElseGet(() -> walletRepository.save(buildNewWallet(userUuid)));
    }

    @Transactional(readOnly = true)
    public Wallet getWalletByUser(UUID userUuid) {
        return walletRepository.findByUserUuid(userUuid)
            .orElseThrow(() -> new WalletNotFoundException("No wallet found"));
    }

    private Wallet buildNewWallet(UUID userUuid) {
        try {
            long credits = allocateDefaultCredits();
            return new Wallet(userUuid, credits, WalletStatus.ACTIVE);
        } catch (RuntimeException e) {
            return new Wallet(userUuid, 0, WalletStatus.SUSPENDED);
        }
    }

    private long allocateDefaultCredits() {
        if (defaultCredits < 0) {
            throw new MisconfiguredCreditsException(String.valueOf(defaultCredits));
        }
        return defaultCredits;
    }

    // public boolean isActive() {
    //     return walletStatus == WalletStatus.ACTIVE;
    // }
    

    public void reserve(Wallet wallet, long amount) {
        requirePositive(amount);
        if (!wallet.isActive()) {
            throw new WalletSuspendedException();
        }
        if (wallet.getAvailableBalance() < amount) {                 
            throw new InsufficientCreditsException(wallet.getAvailableBalance(), amount);
        }
        wallet.setAvailableBalance(wallet.getAvailableBalance() - amount);
        wallet.setReserveBalance(wallet.getReserveBalance() + amount);
    }

   
    public void release(Wallet wallet, long amount) {
        requirePositive(amount);
        if (wallet.getReserveBalance() < amount) {
            throw new IllegalReservedStateException();
        }
        wallet.setReserveBalance(wallet.getReserveBalance() - amount);
        wallet.setAvailableBalance(wallet.getAvailableBalance() + amount);
    }

    private static void requirePositive(long amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Amount must be greater than 0");
        }
    }


    public void deductFromReserve(Wallet wallet, long amount) {
        requirePositive(amount);
        if (wallet.getReserveBalance() < amount) {
            throw new IllegalReservedStateException();
        }
        wallet.setReserveBalance(wallet.getReserveBalance() - amount);
    }

    public void transferToAvailable(Wallet wallet, long amount) {
        requirePositive(amount);
        wallet.setAvailableBalance(wallet.getAvailableBalance() + amount);
    }

}