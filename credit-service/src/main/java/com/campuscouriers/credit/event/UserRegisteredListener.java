/*
 * AI Assistance Disclosure
 * Tool: Anthropic Claude (model unrecorded), date: 2026-10-21
 * Scope (AI-62): Generated the UserRegisteredListener class for the credit service, including a Kafka listener method to handle UserRegisteredEvent and create a wallet for the registered user.
 * Author review: Code changes were checked and validated
 */

package com.campuscouriers.credit.event;

import com.campuscouriers.credit.service.WalletService;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class UserRegisteredListener {

    private final WalletService walletService;

    public UserRegisteredListener(WalletService walletService) {
        this.walletService = walletService;
    }

    @KafkaListener(topics = UserRegisteredEvent.TYPE, groupId = "credit-service")
    
    public void onUserRegistered(UserRegisteredEvent event) {
        walletService.createWallet(event.userId());
    }
}