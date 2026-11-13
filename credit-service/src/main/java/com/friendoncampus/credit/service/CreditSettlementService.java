package com.friendoncampus.credit.service;

import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.friendoncampus.credit.domain.CreditAccount;
import com.friendoncampus.credit.domain.CreditLedgerEntry;
import com.friendoncampus.credit.domain.CreditOperation;
import com.friendoncampus.credit.domain.CreditOperationType;
import com.friendoncampus.credit.domain.CreditReservation;
import com.friendoncampus.credit.domain.LedgerEntryType;
import com.friendoncampus.credit.domain.ReservationStatus;
import com.friendoncampus.credit.repository.CreditAccountRepository;
import com.friendoncampus.credit.repository.CreditLedgerEntryRepository;
import com.friendoncampus.credit.repository.CreditOperationRepository;
import com.friendoncampus.credit.repository.CreditReservationRepository;

@Service
public class CreditSettlementService {

    private static final int COMPENSATION_PERCENT = 20;

    private final CreditAccountRepository accounts;
    private final CreditReservationRepository reservations;
    private final CreditOperationRepository operations;
    private final CreditLedgerEntryRepository ledger;

    public CreditSettlementService(
            CreditAccountRepository accounts,
            CreditReservationRepository reservations,
            CreditOperationRepository operations,
            CreditLedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.reservations = reservations;
        this.operations = operations;
        this.ledger = ledger;
    }

    @Transactional
    public SettlementResult settle(UUID operationId, UUID orderId, UUID courierId) {
        requireIdentifiers(operationId, orderId, courierId);
        String requestHash = fingerprint(CreditOperationType.SETTLE, orderId, courierId);
        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.SETTLE, requestHash);
            return currentResult(orderId, courierId, false);
        }

        CreditReservation reservation = requireReservation(orderId);
        LockedAccounts locked = lockParties(reservation.getRequesterId(), courierId);
        if (reservation.getStatus() == ReservationStatus.SETTLED
                && courierId.equals(reservation.getCourierId())) {
            operations.save(CreditOperation.completed(
                    operationId, CreditOperationType.SETTLE, orderId, requestHash, "ALREADY_SETTLED"));
            return result(reservation, locked.requester(), locked.courier(), reservation.getAmount(), 0, false);
        }
        requireActive(reservation, "settled");

        int amount = reservation.getAmount();
        locked.requester().debitReserved(amount);
        locked.courier().creditAvailable(amount);
        reservation.settle(courierId);
        persistTransfer(operationId, requestHash, reservation, locked, CreditOperationType.SETTLE,
                LedgerEntryType.SETTLEMENT_DEBIT, LedgerEntryType.SETTLEMENT_CREDIT,
                amount, 0, "SETTLED");
        return result(reservation, locked.requester(), locked.courier(), amount, 0, true);
    }

    @Transactional
    public SettlementResult compensate(UUID operationId, UUID orderId, UUID courierId) {
        requireIdentifiers(operationId, orderId, courierId);
        String requestHash = fingerprint(CreditOperationType.COMPENSATE, orderId, courierId);
        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.COMPENSATE, requestHash);
            return currentResult(orderId, courierId, false);
        }

        CreditReservation reservation = requireReservation(orderId);
        LockedAccounts locked = lockParties(reservation.getRequesterId(), courierId);
        int compensation = compensationFor(reservation.getAmount());
        int released = reservation.getAmount() - compensation;
        if (reservation.getStatus() == ReservationStatus.COMPENSATED
                && courierId.equals(reservation.getCourierId())) {
            operations.save(CreditOperation.completed(
                    operationId, CreditOperationType.COMPENSATE, orderId, requestHash, "ALREADY_COMPENSATED"));
            return result(reservation, locked.requester(), locked.courier(), compensation, released, false);
        }
        requireActive(reservation, "compensated");

        locked.requester().debitReserved(reservation.getAmount());
        if (released > 0) {
            locked.requester().creditAvailable(released);
        }
        locked.courier().creditAvailable(compensation);
        reservation.compensate(courierId);
        persistTransfer(operationId, requestHash, reservation, locked, CreditOperationType.COMPENSATE,
                LedgerEntryType.COMPENSATION_DEBIT, LedgerEntryType.COMPENSATION_CREDIT,
                compensation, released, "COMPENSATED");
        return result(reservation, locked.requester(), locked.courier(), compensation, released, true);
    }

    private void persistTransfer(
            UUID operationId,
            String requestHash,
            CreditReservation reservation,
            LockedAccounts locked,
            CreditOperationType operationType,
            LedgerEntryType debitType,
            LedgerEntryType creditType,
            int transferred,
            int released,
            String resultCode) {
        operations.saveAndFlush(CreditOperation.completed(
                operationId, operationType, reservation.getOrderId(), requestHash, resultCode));
        reservations.save(reservation);
        accounts.save(locked.requester());
        accounts.save(locked.courier());
        ledger.save(CreditLedgerEntry.record(
                operationId,
                locked.requester().getUserId(),
                reservation.getId(),
                debitType,
                released,
                -reservation.getAmount(),
                locked.requester().getAvailableBalance(),
                locked.requester().getReservedBalance()));
        ledger.save(CreditLedgerEntry.record(
                operationId,
                locked.courier().getUserId(),
                reservation.getId(),
                creditType,
                transferred,
                0,
                locked.courier().getAvailableBalance(),
                locked.courier().getReservedBalance()));
    }

    private SettlementResult currentResult(UUID orderId, UUID courierId, boolean changed) {
        CreditReservation reservation = reservations.findByOrderId(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        if (!courierId.equals(reservation.getCourierId())) {
            throw new IdempotencyConflictException();
        }
        CreditAccount requester = requireAccount(reservation.getRequesterId());
        CreditAccount courier = requireAccount(courierId);
        int transferred = reservation.getStatus() == ReservationStatus.COMPENSATED
                ? compensationFor(reservation.getAmount())
                : reservation.getAmount();
        int released = reservation.getStatus() == ReservationStatus.COMPENSATED
                ? reservation.getAmount() - transferred
                : 0;
        return result(reservation, requester, courier, transferred, released, changed);
    }

    private LockedAccounts lockParties(UUID requesterId, UUID courierId) {
        if (requesterId.equals(courierId)) {
            throw new IllegalArgumentException("Requester and courier must be different users");
        }
        UUID firstId = requesterId.compareTo(courierId) < 0 ? requesterId : courierId;
        UUID secondId = firstId.equals(requesterId) ? courierId : requesterId;
        CreditAccount first = requireLockedAccount(firstId);
        CreditAccount second = requireLockedAccount(secondId);
        return firstId.equals(requesterId)
                ? new LockedAccounts(first, second)
                : new LockedAccounts(second, first);
    }

    private CreditReservation requireReservation(UUID orderId) {
        return reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
    }

    private CreditAccount requireLockedAccount(UUID userId) {
        return accounts.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new CreditAccountNotFoundException(userId));
    }

    private CreditAccount requireAccount(UUID userId) {
        return accounts.findById(userId)
                .orElseThrow(() -> new CreditAccountNotFoundException(userId));
    }

    private static void requireActive(CreditReservation reservation, String action) {
        if (reservation.getStatus() != ReservationStatus.ACTIVE) {
            throw new InvalidReservationStateException("Only an active reservation can be " + action);
        }
    }

    static int compensationFor(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Reservation amount must be positive");
        }
        return (int) ((((long) amount * COMPENSATION_PERCENT) + 99) / 100);
    }

    private static String fingerprint(CreditOperationType type, Object... values) {
        StringBuilder canonical = new StringBuilder(type.name());
        for (Object value : values) {
            canonical.append('|').append(value);
        }
        return OperationFingerprint.sha256(canonical.toString());
    }

    private static void requireSameRequest(
            CreditOperation previous,
            CreditOperationType expectedType,
            String requestHash) {
        if (previous.getOperationType() != expectedType || !previous.getRequestHash().equals(requestHash)) {
            throw new IdempotencyConflictException();
        }
    }

    private static void requireIdentifiers(UUID... identifiers) {
        for (UUID identifier : identifiers) {
            if (identifier == null) {
                throw new IllegalArgumentException("Operation, order and courier identifiers are required");
            }
        }
    }

    private static SettlementResult result(
            CreditReservation reservation,
            CreditAccount requester,
            CreditAccount courier,
            int transferred,
            int released,
            boolean changed) {
        return new SettlementResult(
                reservation.getOrderId(),
                reservation.getRequesterId(),
                courier.getUserId(),
                reservation.getAmount(),
                transferred,
                released,
                reservation.getStatus(),
                requester.getAvailableBalance(),
                requester.getReservedBalance(),
                courier.getAvailableBalance(),
                courier.getReservedBalance(),
                changed);
    }

    private record LockedAccounts(CreditAccount requester, CreditAccount courier) {
    }

    public record SettlementResult(
            UUID orderId,
            UUID requesterId,
            UUID courierId,
            int reservedAmount,
            int transferredAmount,
            int releasedAmount,
            ReservationStatus status,
            int requesterAvailableBalance,
            int requesterReservedBalance,
            int courierAvailableBalance,
            int courierReservedBalance,
            boolean changed) {
    }
}
