package com.cs3219.foc.credit.service;

import static com.cs3219.foc.credit.model.entity.ReservationState.*;

import com.cs3219.foc.credit.exception.CreditAccountPendingException;
import com.cs3219.foc.credit.model.dto.event.*;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.repository.CreditReservationRepository;
import com.cs3219.foc.credit.service.CreditSettlementSupport.Operation;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CreditRefundService {
    private final CreditSettlementSupport settlement;
    private final CreditReservationRepository creditReservationRepository;
    private final CreditAccountRepository creditAccountRepository;
    private final ApplicationEventPublisher events;

    @Transactional
    public void releaseReservedCredits(ErrandCancelledEvent event) {
        var p = event.payload();
        releaseReservedCredits(
                new Operation(event.eventId(), p.errandId(), p.requesterId(), p.amount(), null, event.occurredAt()));
    }

    @Transactional
    public void releaseReservedCredits(ErrandExpiredEvent event) {
        var p = event.payload();
        releaseReservedCredits(
                new Operation(event.eventId(), p.errandId(), p.requesterId(), p.amount(), null, event.occurredAt()));
    }

    private void releaseReservedCredits(Operation p) {
        var reservation = settlement.lockReservation(p, "REFUND");
        var outcome = settlement.existingOutcome(reservation, p, REFUNDED);
        if (outcome == null) {
            creditAccountRepository
                    .lockByUserId(reservation.getUserId())
                    .orElseThrow(CreditAccountPendingException::new);
            creditReservationRepository.settle(p.errandId(), REFUNDED, null);
            events.publishEvent(
                    new CreditRefundAppliedEvent(p.operationId(), p.errandId(), p.requesterId(), p.amount()));
            outcome = REFUNDED.name();
        }
        if (REFUNDED.name().equals(outcome)) {
            events.publishEvent(new CreditRefundedEvent(
                    UUID.randomUUID(),
                    1,
                    p.occurredAt(),
                    new CreditRefundedEvent.Payload(p.operationId(), p.errandId(), p.requesterId(), p.amount())));
        } else {
            events.publishEvent(new CreditRefundDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    p.occurredAt(),
                    new CreditRefundDeclinedEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), outcome)));
        }
    }
}
