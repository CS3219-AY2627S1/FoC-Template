/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the initial business validation and reservation-ownership implementation from team-finalized behavior.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.credit;

import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.spi.LoggingEventBuilder;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.InvalidCreditIdException;
import sg.edu.nus.foc.credit.error.InvalidCreditAmountException;
import sg.edu.nus.foc.credit.error.InvalidOrderEventException;
import sg.edu.nus.foc.credit.error.ReservationNotFoundException;

@Service
public class CreditService implements CreditOutcomeProcessor {

    private static final Logger log = LoggerFactory.getLogger(CreditService.class);

    private final CreditRepository repository;

    public CreditService(CreditRepository repository) {
        this.repository = repository;
    }

    public RegistrationResult initializeAccount(UUID eventId, String userId, Instant occurredAt) {
        try {
            requireOpaqueId(userId, "userId");
            RegistrationResult result = repository.initializeAccount(eventId, userId, occurredAt);
            log.atInfo()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("operation", "initialize_account")
                    .addKeyValue("eventId", eventId)
                    .addKeyValue("userId", userId)
                    .addKeyValue("initialCredits", CreditConstants.INITIAL_ALLOCATION)
                    .addKeyValue("outcome", result.created() ? "allocated" : "replayed")
                    .log("credit_account_initialized userId={} initialCredits={} outcome={}",
                            userId,
                            CreditConstants.INITIAL_ALLOCATION,
                            result.created() ? "allocated" : "replayed");
            return result;
        } catch (RuntimeException exception) {
            logFailure("initialize_account", null, userId, String.valueOf(eventId), exception);
            throw exception;
        }
    }

    public CreditAccount getAccount(String userId) {
        requireOpaqueId(userId, "userId");
        return repository.findAccount(userId)
                .orElseThrow(() -> new AccountNotFoundException(userId));
    }

    public CreditTransactionPage getTransactions(String userId, int page, int size) {
        requireOpaqueId(userId, "userId");
        if (repository.findAccount(userId).isEmpty()) {
            throw new AccountNotFoundException(userId);
        }
        return repository.findTransactions(userId, page, size);
    }

    public CreditTransactionPage getAllTransactions(int page, int size) {
        return repository.findAllTransactions(page, size);
    }

    public ReservationResult reserve(String orderId, String requesterId, long amount) {
        try {
            requireOpaqueId(orderId, "orderId");
            requireOpaqueId(requesterId, "requesterId");
            if (amount <= 0) {
                throw new InvalidCreditAmountException(amount);
            }
            ReservationResult result = repository.reserve(orderId, requesterId, amount);
            log.atInfo()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("operation", "reserve_credits")
                    .addKeyValue("orderId", orderId)
                    .addKeyValue("userId", requesterId)
                    .addKeyValue("amount", amount)
                    .addKeyValue("usableBalance", result.account().usableBalance())
                    .addKeyValue("reservedBalance", result.account().reservedBalance())
                    .addKeyValue("outcome", result.created() ? "reserved" : "replayed")
                    .log("credits_reserved requesterId={} orderId={} amount={} outcome={}",
                            requesterId,
                            orderId,
                            amount,
                            result.created() ? "reserved" : "replayed");
            return result;
        } catch (RuntimeException exception) {
            logFailure("reserve_credits", orderId, requesterId, null, exception);
            throw exception;
        }
    }

    public CreditReservation getReservation(String orderId, String requesterId) {
        requireOpaqueId(orderId, "orderId");
        return repository.findReservation(orderId)
                .filter(reservation -> reservation.requesterId().equals(requesterId))
                .orElseThrow(() -> new ReservationNotFoundException(orderId));
    }

    public void assignCourier(String orderId, String courierId) {
        try {
            requireOpaqueId(orderId, "orderId");
            requireOpaqueId(courierId, "courierId");
            repository.assignCourier(orderId, courierId);
            log.atInfo()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("operation", "assign_courier")
                    .addKeyValue("orderId", orderId)
                    .addKeyValue("courierId", courierId)
                    .addKeyValue("outcome", "completed_or_replayed")
                    .log("credit_reservation_assigned orderId={} courierId={}", orderId, courierId);
        } catch (RuntimeException exception) {
            logFailure("assign_courier", orderId, courierId, null, exception);
            throw exception;
        }
    }

    public void holdForReopen(String orderId, String callerId) {
        try {
            requireOpaqueId(orderId, "orderId");
            requireOpaqueId(callerId, "callerId");
            repository.holdForReopen(orderId, callerId);
            log.atInfo()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("operation", "hold_for_reopen")
                    .addKeyValue("orderId", orderId)
                    .addKeyValue("courierId", callerId)
                    .addKeyValue("outcome", "completed_or_replayed")
                    .log("credit_reservation_held_for_reopen orderId={} courierId={}",
                            orderId,
                            callerId);
        } catch (RuntimeException exception) {
            logFailure("hold_for_reopen", orderId, callerId, null, exception);
            throw exception;
        }
    }

    @Override
    public void processOutcome(CreditOutcomeEvent event) {
        try {
            validateOutcome(event);
            switch (event.type()) {
                case OPEN_ORDER_REFUND -> repository.refund(event);
                case ORDER_COMPLETION -> repository.settle(event);
            }
            LoggingEventBuilder eventLog = log.atInfo()
                    .addKeyValue("service", "credit-service")
                    .addKeyValue("operation", "process_order_outcome")
                    .addKeyValue("eventId", event.eventId())
                    .addKeyValue("eventType", event.type())
                    .addKeyValue("orderId", event.orderId())
                    .addKeyValue("courierId", event.courierId())
                    .addKeyValue("amount", event.creditAmount())
                    .addKeyValue("orderStatus", event.orderStatus())
                    .addKeyValue("outcome", "completed_or_replayed");
            switch (event.type()) {
                case OPEN_ORDER_REFUND -> eventLog.log(
                        "credits_refunded orderId={} amount={} reason={}",
                        event.orderId(),
                        event.creditAmount(),
                        event.orderStatus());
                case ORDER_COMPLETION -> eventLog.log(
                        "credits_transferred courierId={} orderId={} amount={}",
                        event.courierId(),
                        event.orderId(),
                        event.creditAmount());
            }
        } catch (RuntimeException exception) {
            logFailure("process_order_outcome",
                    event == null ? null : event.orderId(),
                    null,
                    event == null ? null : event.eventId(),
                    exception);
            throw exception;
        }
    }

    private static void logFailure(String operation, String orderId, String userId,
                                   String eventId, RuntimeException exception) {
        log.atWarn()
                .addKeyValue("service", "credit-service")
                .addKeyValue("operation", operation)
                .addKeyValue("orderId", orderId)
                .addKeyValue("userId", userId)
                .addKeyValue("eventId", eventId)
                .addKeyValue("outcome", "failed")
                .addKeyValue("errorType", exception.getClass().getSimpleName())
                .addKeyValue("errorMessage", exception.getMessage())
                .log("credit_operation_failed");
    }

    private static void validateOutcome(CreditOutcomeEvent event) {
        if (event == null) {
            throw new InvalidOrderEventException("Order event is required.");
        }
        requireEventId(event.eventId(), "eventId");
        requireEventId(event.orderId(), "orderId");
        if (event.type() == null || event.occurredAt() == null || event.creditAmount() <= 0) {
            throw new InvalidOrderEventException("Order event metadata is invalid or unsupported.");
        }
        switch (event.type()) {
            case OPEN_ORDER_REFUND -> {
                if (!("CANCELLED".equals(event.orderStatus()) || "EXPIRED".equals(event.orderStatus()))) {
                    throw new InvalidOrderEventException("Open-order refund event has an invalid resulting order.");
                }
            }
            case ORDER_COMPLETION -> {
                if (!"COMPLETED".equals(event.orderStatus()) || event.courierId() == null) {
                    throw new InvalidOrderEventException("Completion event has an invalid resulting order.");
                }
                requireEventId(event.courierId(), "courierId");
            }
        }
    }

    private static void requireEventId(String value, String field) {
        try {
            requireOpaqueId(value, field);
        } catch (InvalidCreditIdException exception) {
            throw new InvalidOrderEventException("Order event field " + field + " is invalid.");
        }
    }

    static void requireOpaqueId(String value, String field) {
        if (value == null || value.isBlank() || value.length() > 128 || value.contains("/")
                || value.equals(".") || value.equals("..")
                || value.startsWith("__") && value.endsWith("__")) {
            throw new InvalidCreditIdException(field);
        }
    }
}
