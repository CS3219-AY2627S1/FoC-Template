/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-10-22
 * Scope (AI-61): Generated the WalletBalanceResponse DTO for the credit service, including a static factory method to convert from the Wallet entity.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.dto;

import com.campuscouriers.credit.entity.Wallet;

public record WalletBalanceResponse(
        long availableBalance
) {
    public static WalletBalanceResponse from(Wallet wallet) {
        return new WalletBalanceResponse(wallet.getAvailableBalance());
    }
}