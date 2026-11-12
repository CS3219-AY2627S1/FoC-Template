/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-11-06
 * Scope (AI-61): Generated the Wallet entity for the credit service
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "wallets")
@Getter
public class Wallet {
 
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "wallet_id", nullable = false, updatable = false)
    private UUID walletId;
 
    @Setter
    @Column(name = "available_balance", nullable = false)
    private long availableBalance;
 
    @Setter
    @Column(name = "reserve_balance", nullable = false)
    private long reserveBalance;
 

    @Enumerated(EnumType.STRING)
    @Column(name = "wallet_status", nullable = false, length = 20)
    private WalletStatus walletStatus;
 
    
    @Column(name = "user_uuid", nullable = false, unique = true, updatable = false)
    private UUID userUuid;

    protected Wallet() {
    }  

    public Wallet(UUID userUuid, long availableBalance, WalletStatus walletStatus) {
        this.userUuid = userUuid;
        this.availableBalance = availableBalance;
        this.reserveBalance = 0;
        this.walletStatus = walletStatus;
    }


    public boolean isActive() {
        return walletStatus == WalletStatus.ACTIVE;
    }

}