/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21 to 2026-11-06
 * Scope (AI-61): Define API endpoints for wallet operations, including retrieving wallet balance and transaction history. Implement access control based on JWT authentication.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.controller;

import com.campuscouriers.credit.dto.WalletBalanceResponse;
import com.campuscouriers.credit.service.WalletService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import com.campuscouriers.credit.dto.CreditRecordsResponse;
import com.campuscouriers.credit.service.CreditRecordsService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;

import java.util.UUID;

@RestController
@RequestMapping("/api/wallets")
public class WalletController {

    private final WalletService walletService;
    private final CreditRecordsService creditRecordsService;

    public WalletController(WalletService walletService, CreditRecordsService creditRecordsService) {
        this.walletService = walletService;
        this.creditRecordsService = creditRecordsService;
    }

    @GetMapping("/availableBalance")
    public WalletBalanceResponse getMyWallet(@AuthenticationPrincipal Jwt jwt) {
        UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Access token contains an invalid user ID");
        }
        return WalletBalanceResponse.from(walletService.getWalletByUser(userId));
    }

    @GetMapping("/transactionHistory")
    public Page<CreditRecordsResponse> getTransactionHistory(@AuthenticationPrincipal Jwt jwt,
                                            @PageableDefault(size = 20) Pageable pageable) {
                UUID userId;
        try {
            userId = UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "Access token contains an invalid user ID");
        }
        return creditRecordsService.getHistory(userId, pageable).map(CreditRecordsResponse::from);
    }
}