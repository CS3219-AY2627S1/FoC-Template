package com.cs3219.foc.credit.service;

import static com.cs3219.foc.credit.model.entity.ReservationState.*;

import com.cs3219.foc.credit.exception.CreditAccountPendingException;
import com.cs3219.foc.credit.exception.ReservationConflictException;
import com.cs3219.foc.credit.model.dto.CreditReservationResponse;
import com.cs3219.foc.credit.model.dto.ReserveCreditRequest;
import com.cs3219.foc.credit.model.dto.event.CreditReservedEvent;
import com.cs3219.foc.credit.model.entity.CreditReservation;
import com.cs3219.foc.credit.model.entity.ReservationState;
import com.cs3219.foc.credit.repository.*;
import com.cs3219.foc.credit.security.CurrentUserService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class CreditReservationService {
    private final CreditAccountRepository creditAccountRepository;
    private final CreditReservationRepository creditReservationRepository;
    private final ApplicationEventPublisher events;
    private final CurrentUserService currentUserService;

    @Transactional
    public CreditReservationResponse reserve(UUID user, ReserveCreditRequest request) {
        // All reservations for an account serialize before reading its available balance.
        creditAccountRepository.lockByUserId(user).orElseThrow(CreditAccountPendingException::new);
        return reserveLocked(user, request);
    }

    private CreditReservationResponse reserveLocked(UUID user, ReserveCreditRequest request) {
        var existing = creditReservationRepository.findById(request.errandId());
        if (existing.isPresent()) return response(existing.get(), user, request);
        long available =
                creditAccountRepository.findBalanceByUserId(user).orElseThrow().availableBalance();
        ReservationState state = available >= request.amount() ? RESERVED : INSUFFICIENT_BALANCE;
        int inserted = creditReservationRepository.reserve(
                request.errandId(), request.operationId(), user, request.amount(), state);
        var reservation =
                creditReservationRepository.findById(request.errandId()).orElseThrow(ReservationConflictException::new);
        var result = response(reservation, user, request);
        if (inserted == 1 && state == RESERVED) {
            events.publishEvent(
                    new CreditReservedEvent(request.operationId(), request.errandId(), user, request.amount()));
        }
        return result;
    }

    @Transactional
    public CreditReservationResponse reserve(ReserveCreditRequest request) {
        var userId = currentUserService.requireCurrentUserId();
        return reserve(userId, request);
    }

    private CreditReservationResponse response(CreditReservation stored, UUID user, ReserveCreditRequest request) {
        if (!stored.getOperationId().equals(request.operationId())
                || !stored.getUserId().equals(user)
                || stored.getAmount() != request.amount()) throw new ReservationConflictException();
        // A repeat reservation retains its original decision even after refund or payment.
        return new CreditReservationResponse(
                (stored.getState() == INSUFFICIENT_BALANCE ? INSUFFICIENT_BALANCE : RESERVED).name());
    }
}
