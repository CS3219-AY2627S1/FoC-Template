/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Code generation.
 * Scope: Generated transactional PostgreSQL persistence, locking, idempotency, and ledger behavior from provided requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import java.util.Objects;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.credit.credit.CreditAccount;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditConstants;
import sg.edu.nus.foc.credit.credit.CreditOutcomeEvent;
import sg.edu.nus.foc.credit.credit.CreditOutcomeType;
import sg.edu.nus.foc.credit.credit.CreditRepository;
import sg.edu.nus.foc.credit.credit.CreditReservation;
import sg.edu.nus.foc.credit.credit.CreditTransactionPage;
import sg.edu.nus.foc.credit.credit.RefundReason;
import sg.edu.nus.foc.credit.credit.RegistrationResult;
import sg.edu.nus.foc.credit.credit.ReservationResult;
import sg.edu.nus.foc.credit.credit.ReservationStatus;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.EventConflictException;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.error.InsufficientCreditsException;
import sg.edu.nus.foc.credit.error.ReservationConflictException;
import sg.edu.nus.foc.credit.error.ReservationNotFoundException;
import sg.edu.nus.foc.credit.error.ReservationStateConflictException;

@Repository
public class JpaCreditRepository implements CreditRepository {

    private final CreditAccountJpaRepository accounts;
    private final CreditReservationJpaRepository reservations;
    private final CreditIdempotencyJpaRepository idempotencyRecords;
    private final CreditLedgerJpaRepository ledger;
    private final Clock clock;

    public JpaCreditRepository(CreditAccountJpaRepository accounts,
                               CreditReservationJpaRepository reservations,
                               CreditIdempotencyJpaRepository idempotencyRecords,
                               CreditLedgerJpaRepository ledger,
                               Clock clock) {
        this.accounts = accounts;
        this.reservations = reservations;
        this.idempotencyRecords = idempotencyRecords;
        this.ledger = ledger;
        this.clock = clock;
    }

    @Override
    @Transactional
    public RegistrationResult initializeAccount(UUID eventId, String userId, Instant occurredAt) {
        String eventKey = eventId.toString();
        String hash = payloadHash(IdempotencyOperation.USER_REGISTERED, userId, null, occurredAt);
        Instant now = clock.instant();
        int claimed = idempotencyRecords.insertIfAbsent(
                IdempotencyOperation.USER_REGISTERED, eventKey, hash, now);

        if (claimed == 0) {
            CreditIdempotencyRecordEntity existing = idempotencyRecords.findById(
                    new CreditIdempotencyRecordId(IdempotencyOperation.USER_REGISTERED, eventKey))
                    .orElseThrow();
            if (!hash.equals(existing.payloadHash())) {
                throw new EventConflictException(eventKey);
            }
            CreditAccount account = accounts.findById(userId)
                    .map(CreditAccountEntity::toDomain)
                    .orElseThrow(() -> new IllegalStateException(
                            "Processed registration event has no credit account"));
            return new RegistrationResult(account, false);
        }

        int created = accounts.insertIfAbsent(userId, CreditConstants.INITIAL_ALLOCATION, now);
        CreditAccountEntity account = accounts.findById(userId).orElseThrow();
        if (created == 1) {
            ledger.save(CreditLedgerEntity.initialAllocation(
                    userId, eventKey, CreditConstants.INITIAL_ALLOCATION, occurredAt, now));
        }
        return new RegistrationResult(account.toDomain(), created == 1);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CreditAccount> findAccount(String userId) {
        return accounts.findById(userId).map(CreditAccountEntity::toDomain);
    }

    @Override
    @Transactional(readOnly = true)
    public CreditTransactionPage findTransactions(String userId, int page, int size) {
        Page<CreditLedgerEntity> result = ledger.findUserVisibleByUserId(
                userId,
                CreditCommandOperation.RESERVE,
                CreditCommandOutcome.COMPENSATED,
                "REVERSED",
                transactionPageRequest(page, size));
        return toTransactionPage(result, page, size);
    }

    @Override
    @Transactional(readOnly = true)
    public CreditTransactionPage findAllTransactions(int page, int size) {
        Page<CreditLedgerEntity> result = ledger.findAllUserVisible(
                CreditCommandOperation.RESERVE,
                CreditCommandOutcome.COMPENSATED,
                "REVERSED",
                transactionPageRequest(page, size));
        return toTransactionPage(result, page, size);
    }

    private static PageRequest transactionPageRequest(int page, int size) {
        return PageRequest.of(
                page - 1,
                size,
                Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("createdAt"),
                        Sort.Order.desc("entryId")));
    }

    private static CreditTransactionPage toTransactionPage(
            Page<CreditLedgerEntity> result, int page, int size) {
        return new CreditTransactionPage(
                result.getContent().stream().map(CreditLedgerEntity::toTransaction).toList(),
                page,
                size,
                result.getTotalElements(),
                result.getTotalPages());
    }

    @Override
    @Transactional
    public ReservationResult reserve(String orderId, String requesterId, long amount) {
        Optional<CreditReservationEntity> existing = reservations.findById(orderId);
        if (existing.isPresent()) {
            return replayReservation(existing.get(), orderId, requesterId, amount);
        }
        if (!accounts.existsById(requesterId)) {
            throw new AccountNotFoundException(requesterId);
        }

        Instant now = clock.instant();
        int created = reservations.insertIfAbsent(orderId, requesterId, amount, null,
                UUID.randomUUID().toString(), now);
        CreditReservationEntity reservation = reservations.findByOrderIdForUpdate(orderId).orElseThrow();
        if (created == 0) {
            return replayReservation(reservation, orderId, requesterId, amount);
        }

        CreditAccountEntity account = accounts.findByUserIdForUpdate(requesterId)
                .orElseThrow(() -> new AccountNotFoundException(requesterId));
        CreditAccount current = account.toDomain();
        if (current.usableBalance() < amount) {
            throw new InsufficientCreditsException(current.usableBalance(), amount);
        }

        account.reserve(amount, now);
        ledger.save(CreditLedgerEntity.reservation(requesterId, orderId, amount, now));
        return new ReservationResult(reservation.toDomain(), account.toDomain(), true);
    }

    private ReservationResult replayReservation(CreditReservationEntity reservation, String orderId,
                                                String requesterId, long amount) {
        if (!reservation.requesterId().equals(requesterId) || reservation.amount() != amount) {
            throw new ReservationConflictException(orderId);
        }
        CreditAccount account = accounts.findById(requesterId)
                .map(CreditAccountEntity::toDomain)
                .orElseThrow(() -> new IllegalStateException(
                        "Credit reservation has no requester account"));
        return new ReservationResult(reservation.toDomain(), account, false);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<CreditReservation> findReservation(String orderId) {
        return reservations.findById(orderId).map(CreditReservationEntity::toDomain);
    }

    @Override
    @Transactional
    public void assignCourier(String orderId, String courierId) {
        CreditReservationEntity reservation = lockedReservation(orderId);
        requireReserved(reservation, orderId);
        if (reservation.requesterId().equals(courierId)) {
            throw new ForbiddenException("The requester cannot be assigned as courier for the same order.");
        }
        if (courierId.equals(reservation.courierId())) {
            return;
        }
        if (reservation.courierId() != null) {
            throw new ReservationStateConflictException(orderId,
                    "is already assigned to a different courier.");
        }
        if (!accounts.existsById(courierId)) {
            throw new AccountNotFoundException(courierId);
        }
        reservation.assignCourier(courierId, clock.instant());
    }

    @Override
    @Transactional
    public void holdForReopen(String orderId, String callerId) {
        CreditReservationEntity reservation = lockedReservation(orderId);
        requireReserved(reservation, orderId);
        if (reservation.courierId() == null) {
            return;
        }
        if (!reservation.courierId().equals(callerId)) {
            throw new ForbiddenException("Only the assigned courier may reset this credit reservation.");
        }
        reservation.clearCourier(clock.instant());
    }

    @Override
    @Transactional
    public void refund(CreditOutcomeEvent event) {
        IdempotencyOperation operation = operation(event.type());
        if (!claimEvent(operation, event)) {
            return;
        }

        CreditReservationEntity reservation = lockedReservation(event.orderId());
        validateEventReservation(reservation, event);
        if (!Objects.equals(event.courierId(), reservation.courierId())) {
            throw new ReservationStateConflictException(event.orderId(),
                    "does not match the courier in the Order event.");
        }
        if (reservation.status() == ReservationStatus.REFUNDED) {
            return;
        }
        requireReserved(reservation, event.orderId());

        Instant now = clock.instant();
        CreditAccountEntity requester = lockedAccount(reservation.requesterId());
        requester.release(reservation.amount(), now);
        reservation.refund(event.eventId(), now);
        ledger.save(CreditLedgerEntity.refund(
                reservation.requesterId(), event.orderId(), event.type().name(), event.eventId(),
                refundReason(event.orderStatus()), reservation.amount(), event.occurredAt(), now));
    }

    @Override
    @Transactional
    public void settle(CreditOutcomeEvent event) {
        if (!claimEvent(IdempotencyOperation.ORDER_COMPLETION, event)) {
            return;
        }

        CreditReservationEntity reservation = lockedReservation(event.orderId());
        validateEventReservation(reservation, event);
        if (!event.courierId().equals(reservation.courierId())) {
            throw new ReservationStateConflictException(event.orderId(),
                    "does not match the courier in the completion event.");
        }
        if (reservation.status() == ReservationStatus.PAID) {
            return;
        }
        requireReserved(reservation, event.orderId());

        Instant now = clock.instant();
        CreditAccountEntity requester;
        CreditAccountEntity courier;
        if (reservation.requesterId().equals(reservation.courierId())) {
            requester = lockedAccount(reservation.requesterId());
            courier = requester;
        } else if (reservation.requesterId().compareTo(reservation.courierId()) < 0) {
            requester = lockedAccount(reservation.requesterId());
            courier = lockedAccount(reservation.courierId());
        } else {
            courier = lockedAccount(reservation.courierId());
            requester = lockedAccount(reservation.requesterId());
        }
        requester.pay(reservation.amount(), now);
        courier.receive(reservation.amount(), now);
        reservation.markPaid(event.eventId(), now);
        ledger.save(CreditLedgerEntity.paymentSent(
                reservation.requesterId(), event.orderId(), event.eventId(), reservation.amount(),
                event.occurredAt(), now));
        ledger.save(CreditLedgerEntity.paymentReceived(
                reservation.courierId(), event.orderId(), event.eventId(), reservation.amount(),
                event.occurredAt(), now));
    }

    private boolean claimEvent(IdempotencyOperation operation, CreditOutcomeEvent event) {
        String hash = outcomePayloadHash(event);
        int claimed = idempotencyRecords.insertIfAbsent(
                operation, event.eventId(), hash, clock.instant());
        if (claimed == 1) {
            return true;
        }
        CreditIdempotencyRecordEntity existing = idempotencyRecords.findById(
                new CreditIdempotencyRecordId(operation, event.eventId())).orElseThrow();
        if (!hash.equals(existing.payloadHash())) {
            throw new EventConflictException(event.eventId());
        }
        return false;
    }

    private CreditReservationEntity lockedReservation(String orderId) {
        return reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new ReservationNotFoundException(orderId));
    }

    private CreditAccountEntity lockedAccount(String userId) {
        return accounts.findByUserIdForUpdate(userId)
                .orElseThrow(() -> new AccountNotFoundException(userId));
    }

    private static void requireReserved(CreditReservationEntity reservation, String orderId) {
        if (reservation.status() != ReservationStatus.RESERVED) {
            throw new ReservationStateConflictException(orderId,
                    "is not active; current state is " + reservation.status() + ".");
        }
    }

    private static void validateEventReservation(CreditReservationEntity reservation,
                                                   CreditOutcomeEvent event) {
        if (reservation.amount() != event.creditAmount()) {
            throw new ReservationStateConflictException(event.orderId(),
                    "does not match the amount in the Order event.");
        }
    }

    private static IdempotencyOperation operation(CreditOutcomeType type) {
        return switch (type) {
            case OPEN_ORDER_REFUND -> IdempotencyOperation.OPEN_ORDER_REFUND;
            case ORDER_COMPLETION -> IdempotencyOperation.ORDER_COMPLETION;
        };
    }

    private static RefundReason refundReason(String orderStatus) {
        return switch (orderStatus) {
            case "CANCELLED" -> RefundReason.CANCELLATION;
            case "EXPIRED" -> RefundReason.EXPIRY;
            default -> throw new IllegalArgumentException("Unsupported refund status: " + orderStatus);
        };
    }

    static String payloadHash(IdempotencyOperation operation, String userId, String orderId,
                              Instant occurredAt) {
        String canonical = operation.name() + "\n" + nullToEmpty(userId) + "\n"
                + nullToEmpty(orderId)
                + "\n" + occurredAt;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    static String outcomePayloadHash(CreditOutcomeEvent event) {
        String canonical = String.join("\n",
                event.type().name(), event.eventId(), event.orderId(), event.orderStatus(),
                Long.toString(event.creditAmount()), event.occurredAt().toString(),
                nullToEmpty(event.courierId()));
        return sha256(canonical);
    }

    private static String sha256(String canonical) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }
}
