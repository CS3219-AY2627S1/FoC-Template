package com.cs3219.foc.credit.infrastructure.messaging.consumer;

import com.cs3219.foc.credit.model.dto.event.ErrandCompletedEvent;
import com.cs3219.foc.credit.service.CreditPaymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ErrandPaymentConsumer {
    private final CreditPaymentService creditPaymentService;

    public void transferReservedCredits(ErrandCompletedEvent event) {
        creditPaymentService.transferReservedCredits(event);
    }
}
