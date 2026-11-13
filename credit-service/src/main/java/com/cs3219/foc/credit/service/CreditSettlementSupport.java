package com.cs3219.foc.credit.service;

import static com.cs3219.foc.credit.model.entity.ReservationState.*;

import com.cs3219.foc.credit.model.entity.CreditReservation;
import com.cs3219.foc.credit.model.entity.ReservationState;
import com.cs3219.foc.credit.repository.CreditReservationRepository;
import com.cs3219.foc.credit.repository.CreditTransactionLogRepository;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
class CreditSettlementSupport {
    private final CreditReservationRepository creditReservationRepository;
    private final CreditTransactionLogRepository creditTransactionLogRepository;

    CreditReservation lockReservation(Operation p, String type) {
        // Serialize terminal decisions before locking the affected accounts.
        var reservation = creditReservationRepository
                .lockByErrandId(p.errandId())
                .orElseThrow(() -> new IllegalStateException("Reservation is not ready; retry settlement"));
        var previous = creditTransactionLogRepository.findById(p.operationId());
        if (previous.isPresent()) {
            var log = previous.get();
            if (!log.getErrandId().equals(p.errandId())
                    || !log.getUserId().equals(p.requesterId())
                    || log.getAmount() != p.amount()
                    || !Objects.equals(log.getCourierId(), p.courierId())
                    || !log.getTransactionType().equals(type)) {
                throw new IllegalArgumentException("Errand event ID cannot be reused with changed data");
            }
        }
        return reservation;
    }

    String existingOutcome(CreditReservation reservation, Operation p, ReservationState target) {
        if (!reservation.getUserId().equals(p.requesterId()) || reservation.getAmount() != p.amount()) {
            return "RESERVATION_MISMATCH";
        }
        if (reservation.getState() == INSUFFICIENT_BALANCE) {
            return "NO_RESERVATION";
        }
        if (reservation.getState() != RESERVED) {
            boolean sameEffect =
                    target == reservation.getState() && Objects.equals(reservation.getCourierId(), p.courierId());
            return sameEffect ? target.name() : "TERMINAL_CONFLICT";
        }
        return null;
    }

    // The Order event ID identifies the credit operation.
    record Operation(
            UUID operationId,
            UUID errandId,
            UUID requesterId,
            long amount,
            UUID courierId,
            OffsetDateTime occurredAt) {}
}
