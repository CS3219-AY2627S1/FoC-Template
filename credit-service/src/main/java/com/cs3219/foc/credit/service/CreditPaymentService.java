package com.cs3219.foc.credit.service;

import static com.cs3219.foc.credit.model.entity.ReservationState.*;

import com.cs3219.foc.credit.exception.CreditAccountPendingException;
import com.cs3219.foc.credit.model.dto.event.*;
import com.cs3219.foc.credit.repository.CreditAccountRepository;
import com.cs3219.foc.credit.repository.CreditReservationRepository;
import com.cs3219.foc.credit.service.CreditSettlementSupport.Operation;
import java.util.UUID;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CreditPaymentService {
    private final CreditSettlementSupport settlement;
    private final CreditReservationRepository creditReservationRepository;
    private final CreditAccountRepository creditAccountRepository;
    private final ApplicationEventPublisher events;

    @Transactional
    public void transferReservedCredits(ErrandCompletedEvent event) {
        var payload = event.payload();
        var p = new Operation(
                event.eventId(),
                payload.errandId(),
                payload.requesterId(),
                payload.amount(),
                payload.courierId(),
                event.occurredAt());
        var reservation = settlement.lockReservation(p, "PAYMENT");
        var outcome = settlement.existingOutcome(reservation, p, PAID);
        if (outcome == null) {
            // Use the same account order for transfers in either direction.
            for (var user : Stream.of(reservation.getUserId(), p.courierId())
                    .distinct()
                    .sorted()
                    .toList()) {
                creditAccountRepository.lockByUserId(user).orElseThrow(CreditAccountPendingException::new);
            }
            creditAccountRepository.debitTotal(reservation.getUserId(), reservation.getAmount());
            creditAccountRepository.creditTotal(p.courierId(), reservation.getAmount());
            creditReservationRepository.settle(p.errandId(), PAID, p.courierId());
            events.publishEvent(new CreditPaymentAppliedEvent(
                    p.operationId(), p.errandId(), p.requesterId(), p.amount(), p.courierId()));
            outcome = PAID.name();
        }
        if (PAID.name().equals(outcome)) {
            events.publishEvent(new CreditPaidEvent(
                    UUID.randomUUID(),
                    1,
                    p.occurredAt(),
                    new CreditPaidEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), p.courierId())));
        } else {
            events.publishEvent(new CreditPaymentDeclinedEvent(
                    UUID.randomUUID(),
                    1,
                    p.occurredAt(),
                    new CreditPaymentDeclinedEvent.Payload(
                            p.operationId(), p.errandId(), p.requesterId(), p.amount(), p.courierId(), outcome)));
        }
    }
}
