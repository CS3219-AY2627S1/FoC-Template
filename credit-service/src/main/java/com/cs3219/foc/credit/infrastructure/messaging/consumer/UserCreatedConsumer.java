package com.cs3219.foc.credit.infrastructure.messaging.consumer;

import com.cs3219.foc.credit.model.dto.event.UserCreatedEvent;
import com.cs3219.foc.credit.service.CreditAccountService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserCreatedConsumer {
    private final CreditAccountService creditAccountService;

    public void initializeAccount(UserCreatedEvent event) {
        var userId = event.payload().userId();
        creditAccountService.initializeAccount(userId);
    }
}
