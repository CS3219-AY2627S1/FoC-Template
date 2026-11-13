package com.friendoncampus.credit.service;

import java.util.Optional;
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
public class CreditReservationService {

    private static final String CREDIT_RESERVATION_TIMEOUT = "CREDIT_RESERVATION_TIMEOUT";
    private static final String NO_RESERVATION_TO_RELEASE = "NO_RESERVATION_TO_RELEASE";

    private final CreditAccountRepository accounts;
    private final CreditReservationRepository reservations;
    private final CreditOperationRepository operations;
    private final CreditLedgerEntryRepository ledger;

    public CreditReservationService(
            CreditAccountRepository accounts,
            CreditReservationRepository reservations,
            CreditOperationRepository operations,
            CreditLedgerEntryRepository ledger) {
        this.accounts = accounts;
        this.reservations = reservations;
        this.operations = operations;
        this.ledger = ledger;
    }

    @Transactional(noRollbackFor = CreditRequestRejectedException.class)
    public ReservationResult reserve(UUID operationId, UUID orderId, UUID requesterId, int amount) {
        requireIdentifiers(operationId, orderId, requesterId);
        requirePositive(amount);
        String requestHash = fingerprint(CreditOperationType.RESERVE, orderId, requesterId, amount);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.RESERVE, requestHash);
            throwIfRejected(previous, orderId, requesterId);
            return currentResult(orderId, false);
        }

        try {
            CreditReservation existing = reservations.findByOrderId(orderId).orElse(null);
            if (existing != null) {
                if (!existing.getRequesterId().equals(requesterId) || existing.getAmount() != amount) {
                    throw new ReservationConflictException();
                }
                CreditAccount account = requireAccount(requesterId, false);
                operations.save(CreditOperation.completed(
                        operationId, CreditOperationType.RESERVE, orderId, requestHash, "ALREADY_RESERVED"));
                return result(existing, account, false);
            }

            CreditAccount account = requireAccount(requesterId, true);
            try {
                account.reserve(amount);
            } catch (IllegalStateException exception) {
                throw new InsufficientCreditsException();
            }

            CreditReservation reservation = CreditReservation.active(orderId, requesterId, amount);
            operations.saveAndFlush(CreditOperation.completed(
                    operationId, CreditOperationType.RESERVE, orderId, requestHash, "RESERVED"));
            reservations.saveAndFlush(reservation);
            accounts.save(account);
            ledger.save(CreditLedgerEntry.record(
                    operationId,
                    requesterId,
                    reservation.getId(),
                    LedgerEntryType.RESERVATION_CREATED,
                    -amount,
                    amount,
                    account.getAvailableBalance(),
                    account.getReservedBalance()));
            return result(reservation, account, true);
        } catch (CreditRequestRejectedException rejection) {
            recordRejection(operationId, CreditOperationType.RESERVE, orderId, requestHash, rejection);
            throw rejection;
        }
    }

    @Transactional(noRollbackFor = CreditRequestRejectedException.class)
    public ReservationResult adjust(UUID operationId, UUID orderId, int newAmount) {
        requireIdentifiers(operationId, orderId);
        requirePositive(newAmount);
        String requestHash = fingerprint(CreditOperationType.ADJUST, orderId, newAmount);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.ADJUST, requestHash);
            throwIfRejected(previous, orderId, null);
            return currentResult(orderId, false);
        }

        try {
            CreditReservation reservation = requireActiveReservation(orderId);
            CreditAccount account = requireAccount(reservation.getRequesterId(), true);
            int difference = newAmount - reservation.getAmount();
            LedgerEntryType entryType = null;

            if (difference > 0) {
                try {
                    account.reserve(difference);
                } catch (IllegalStateException exception) {
                    throw new InsufficientCreditsException();
                }
                entryType = LedgerEntryType.RESERVATION_INCREASED;
            } else if (difference < 0) {
                account.release(-difference);
                entryType = LedgerEntryType.RESERVATION_DECREASED;
            }

            reservation.adjustAmount(newAmount);
            operations.saveAndFlush(CreditOperation.completed(
                    operationId,
                    CreditOperationType.ADJUST,
                    orderId,
                    requestHash,
                    difference == 0 ? "UNCHANGED" : "ADJUSTED"));
            reservations.save(reservation);
            accounts.save(account);

            if (difference != 0) {
                ledger.save(CreditLedgerEntry.record(
                        operationId,
                        account.getUserId(),
                        reservation.getId(),
                        entryType,
                        -difference,
                        difference,
                        account.getAvailableBalance(),
                        account.getReservedBalance()));
            }
            return result(reservation, account, difference != 0);
        } catch (CreditRequestRejectedException rejection) {
            recordRejection(operationId, CreditOperationType.ADJUST, orderId, requestHash, rejection);
            throw rejection;
        }
    }

    @Transactional
    public ReservationResult release(UUID operationId, UUID orderId) {
        requireIdentifiers(operationId, orderId);
        String requestHash = fingerprint(CreditOperationType.RELEASE, orderId);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.RELEASE, requestHash);
            return currentResult(orderId, false);
        }

        CreditReservation reservation = reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        return releaseExisting(operationId, orderId, requestHash, reservation);
    }

    /**
     * Applies the cleanup requested by an Order that stopped waiting for Credit. Unlike a normal
     * expiry/cancellation release, an absent reservation is a successful, durable no-op because
     * Credit may never have created the hold before the Order timed out.
     */
    @Transactional
    public Optional<ReservationResult> releaseForPendingCreditTimeout(UUID operationId, UUID orderId) {
        requireIdentifiers(operationId, orderId);
        String requestHash = fingerprint(CreditOperationType.RELEASE, orderId, CREDIT_RESERVATION_TIMEOUT);

        CreditOperation previous = operations.findById(operationId).orElse(null);
        if (previous != null) {
            requireSameRequest(previous, CreditOperationType.RELEASE, requestHash);
            if (NO_RESERVATION_TO_RELEASE.equals(previous.getResultCode())) {
                return Optional.empty();
            }
            return Optional.of(currentResult(orderId, false));
        }

        CreditReservation reservation = reservations.findByOrderIdForUpdate(orderId).orElse(null);
        if (reservation == null) {
            operations.saveAndFlush(CreditOperation.completed(
                    operationId,
                    CreditOperationType.RELEASE,
                    orderId,
                    requestHash,
                    NO_RESERVATION_TO_RELEASE));
            return Optional.empty();
        }
        return Optional.of(releaseExisting(operationId, orderId, requestHash, reservation));
    }

    private ReservationResult releaseExisting(
            UUID operationId,
            UUID orderId,
            String requestHash,
            CreditReservation reservation) {
        CreditAccount account = requireAccount(reservation.getRequesterId(), true);

        if (reservation.getStatus() == ReservationStatus.RELEASED) {
            operations.save(CreditOperation.completed(
                    operationId, CreditOperationType.RELEASE, orderId, requestHash, "ALREADY_RELEASED"));
            return result(reservation, account, false);
        }
        if (reservation.getStatus() != ReservationStatus.ACTIVE) {
            throw new InvalidReservationStateException("Only an active reservation can be released");
        }

        int amount = reservation.getAmount();
        account.release(amount);
        reservation.release();
        operations.saveAndFlush(CreditOperation.completed(
                operationId, CreditOperationType.RELEASE, orderId, requestHash, "RELEASED"));
        reservations.save(reservation);
        accounts.save(account);
        ledger.save(CreditLedgerEntry.record(
                operationId,
                account.getUserId(),
                reservation.getId(),
                LedgerEntryType.RESERVATION_RELEASED,
                amount,
                -amount,
                account.getAvailableBalance(),
                account.getReservedBalance()));
        return result(reservation, account, true);
    }

    private ReservationResult currentResult(UUID orderId, boolean changed) {
        CreditReservation reservation = reservations.findByOrderId(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        CreditAccount account = requireAccount(reservation.getRequesterId(), false);
        return result(reservation, account, changed);
    }

    private CreditReservation requireActiveReservation(UUID orderId) {
        CreditReservation reservation = reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
        if (reservation.getStatus() != ReservationStatus.ACTIVE) {
            throw new InvalidReservationStateException("Only an active reservation can be adjusted");
        }
        return reservation;
    }

    private CreditAccount requireAccount(UUID userId, boolean lock) {
        return (lock ? accounts.findByUserIdForUpdate(userId) : accounts.findById(userId))
                .orElseThrow(() -> new CreditAccountNotFoundException(userId));
    }

    private static ReservationResult result(
            CreditReservation reservation,
            CreditAccount account,
            boolean changed) {
        return new ReservationResult(
                reservation.getOrderId(),
                reservation.getId(),
                reservation.getRequesterId(),
                reservation.getAmount(),
                reservation.getStatus(),
                account.getAvailableBalance(),
                account.getReservedBalance(),
                changed);
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

    private void recordRejection(
            UUID operationId,
            CreditOperationType operationType,
            UUID orderId,
            String requestHash,
            CreditRequestRejectedException rejection) {
        operations.saveAndFlush(CreditOperation.completed(
                operationId, operationType, orderId, requestHash, rejectionCode(rejection)));
    }

    private void throwIfRejected(CreditOperation operation, UUID orderId, UUID requesterId) {
        switch (operation.getResultCode()) {
            case "INSUFFICIENT_CREDITS" -> throw new InsufficientCreditsException();
            case "CREDIT_ACCOUNT_NOT_FOUND" -> {
                UUID accountId = requesterId;
                if (accountId == null) {
                    accountId = reservations.findByOrderId(orderId)
                            .map(CreditReservation::getRequesterId)
                            .orElseThrow(() -> new CreditReservationNotFoundException(orderId));
                }
                throw new CreditAccountNotFoundException(accountId);
            }
            case "RESERVATION_NOT_FOUND" -> throw new CreditReservationNotFoundException(orderId);
            case "INVALID_RESERVATION_STATE" ->
                    throw new InvalidReservationStateException("Reservation request was previously rejected");
            case "REQUEST_CONFLICT" -> throw new ReservationConflictException();
            default -> {
                boolean knownSuccess = operation.getOperationType() == CreditOperationType.RESERVE
                        ? operation.getResultCode().equals("RESERVED")
                                || operation.getResultCode().equals("ALREADY_RESERVED")
                        : operation.getResultCode().equals("ADJUSTED")
                                || operation.getResultCode().equals("UNCHANGED");
                if (!knownSuccess) {
                    throw new IllegalStateException("Stored credit operation has an unknown result code");
                }
            }
        }
    }

    private static String rejectionCode(CreditRequestRejectedException rejection) {
        if (rejection instanceof InsufficientCreditsException) {
            return "INSUFFICIENT_CREDITS";
        }
        if (rejection instanceof CreditAccountNotFoundException) {
            return "CREDIT_ACCOUNT_NOT_FOUND";
        }
        if (rejection instanceof CreditReservationNotFoundException) {
            return "RESERVATION_NOT_FOUND";
        }
        if (rejection instanceof InvalidReservationStateException) {
            return "INVALID_RESERVATION_STATE";
        }
        return "REQUEST_CONFLICT";
    }

    private static void requirePositive(int amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Credit amount must be positive");
        }
    }

    private static void requireIdentifiers(UUID... identifiers) {
        for (UUID identifier : identifiers) {
            if (identifier == null) {
                throw new IllegalArgumentException("Operation, order and user identifiers are required");
            }
        }
    }

    public record ReservationResult(
            UUID orderId,
            UUID reservationId,
            UUID requesterId,
            int amount,
            ReservationStatus status,
            int availableBalance,
            int reservedBalance,
            boolean changed) {
    }
}
