package com.cs3219.foc.credit.infrastructure.messaging.consumer;

import com.cs3219.foc.credit.model.dto.event.ErrandCancelledEvent;
import com.cs3219.foc.credit.model.dto.event.ErrandExpiredEvent;
import com.cs3219.foc.credit.service.CreditRefundService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ErrandRefundConsumer {
    private final CreditRefundService creditRefundService;

    public void releaseReservedCredits(ErrandCancelledEvent event) {
        creditRefundService.releaseReservedCredits(event);
    }

    public void releaseReservedCredits(ErrandExpiredEvent event) {
        creditRefundService.releaseReservedCredits(event);
    }
}
