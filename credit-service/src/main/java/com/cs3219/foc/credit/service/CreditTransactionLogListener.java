package com.cs3219.foc.credit.service;

import com.cs3219.foc.credit.model.dto.event.CreditPaymentAppliedEvent;
import com.cs3219.foc.credit.model.dto.event.CreditRefundAppliedEvent;
import com.cs3219.foc.credit.model.dto.event.CreditReservedEvent;
import com.cs3219.foc.credit.repository.CreditTransactionLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CreditTransactionLogListener {
    private final CreditTransactionLogRepository repository;

    // Keep audit writes synchronous in the service transaction, before publishing the payment or refund confirmation.
    @EventListener
    public void recordReservation(CreditReservedEvent event) {
        repository.record(event.operationId(), event.errandId(), event.userId(), null, event.amount(), "RESERVE");
    }

    @EventListener
    public void recordRefund(CreditRefundAppliedEvent event) {
        repository.record(event.operationId(), event.errandId(), event.requesterId(), null, event.amount(), "REFUND");
    }

    @EventListener
    public void recordPayment(CreditPaymentAppliedEvent event) {
        repository.record(
                event.operationId(),
                event.errandId(),
                event.requesterId(),
                event.courierId(),
                event.amount(),
                "PAYMENT");
    }
}
