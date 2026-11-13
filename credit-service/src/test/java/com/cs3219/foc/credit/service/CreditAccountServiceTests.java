package com.cs3219.foc.credit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.cs3219.foc.credit.config.CreditProperties;
import com.cs3219.foc.credit.model.dto.CreditBalanceResponse;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class CreditAccountServiceTests {
    private final CreditAccountRepository repository = mock(CreditAccountRepository.class);
    private final CurrentUserService currentUserService = mock(CurrentUserService.class);
    private final CreditAccountService service =
            new CreditAccountService(repository, mock(CreditProperties.class), currentUserService);

    @Test
    void getBalanceUsesAuthenticatedId() {
        var userId = UUID.randomUUID();
        var balance = new CreditBalanceResponse(20, 5);
        when(currentUserService.requireCurrentUserId()).thenReturn(userId);
        when(repository.findBalanceByUserId(userId)).thenReturn(Optional.of(balance));

        assertThat(service.getBalance()).isEqualTo(balance);
    }
}
