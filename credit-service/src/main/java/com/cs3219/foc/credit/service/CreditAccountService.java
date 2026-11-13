package com.cs3219.foc.credit.service;

import com.cs3219.foc.credit.config.CreditProperties;
import com.cs3219.foc.credit.exception.CreditAccountPendingException;
import com.cs3219.foc.credit.model.dto.CreditBalanceResponse;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CreditAccountService {
    private final CreditAccountRepository repository;
    private final CreditProperties properties;
    private final CurrentUserService currentUserService;

    /** Returns true only when this call creates the account with its initial credit allocation. */
    @Transactional
    public boolean initializeAccount(UUID userId) {
        return repository.initializeIfAbsent(userId, properties.initialAllocation()) == 1;
    }

    @Transactional(readOnly = true)
    public CreditBalanceResponse getBalance(UUID userId) {
        return repository.findBalanceByUserId(userId).orElseThrow(CreditAccountPendingException::new);
    }

    @Transactional(readOnly = true)
    public CreditBalanceResponse getBalance() {
        var userId = currentUserService.requireCurrentUserId();
        return getBalance(userId);
    }
}
