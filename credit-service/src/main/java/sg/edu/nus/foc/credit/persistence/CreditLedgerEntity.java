/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA credit ledger entity based on the provided PostgreSQL schema and requirements.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import sg.edu.nus.foc.credit.credit.LedgerEffectType;
import sg.edu.nus.foc.credit.credit.CreditDirection;
import sg.edu.nus.foc.credit.credit.CreditTransaction;
import sg.edu.nus.foc.credit.credit.CreditTransactionType;
import sg.edu.nus.foc.credit.credit.RefundReason;

@Entity
@Table(name = "credit_ledger")
public class CreditLedgerEntity {

    @Id
    @Column(name = "entry_id")
    private UUID entryId;

    @Column(name = "user_id", nullable = false, length = 128)
    private String userId;

    @Column(name = "order_id", length = 128)
    private String orderId;

    @Column(name = "origin_type", nullable = false, length = 80)
    private String originType;

    @Column(name = "origin_id", nullable = false, length = 128)
    private String originId;

    @Column(name = "command_id", length = 128)
    private String commandId;

    @Enumerated(EnumType.STRING)
    @Column(name = "effect_type", nullable = false, length = 40)
    private LedgerEffectType effectType;

    @Enumerated(EnumType.STRING)
    @Column(name = "refund_reason", length = 20)
    private RefundReason refundReason;

    @Column(nullable = false)
    private long amount;

    @Column(name = "total_balance_delta", nullable = false)
    private long totalBalanceDelta;

    @Column(name = "reserved_balance_delta", nullable = false)
    private long reservedBalanceDelta;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CreditLedgerEntity() {
    }

    private CreditLedgerEntity(String userId, String orderId, String originType, String originId,
                               String commandId, LedgerEffectType effectType, RefundReason refundReason,
                               long amount, long totalBalanceDelta,
                               long reservedBalanceDelta, Instant occurredAt, Instant createdAt) {
        this.entryId = UUID.randomUUID();
        this.userId = userId;
        this.orderId = orderId;
        this.originType = originType;
        this.originId = originId;
        this.commandId = commandId;
        this.effectType = effectType;
        this.refundReason = refundReason;
        this.amount = amount;
        this.totalBalanceDelta = totalBalanceDelta;
        this.reservedBalanceDelta = reservedBalanceDelta;
        this.occurredAt = occurredAt;
        this.createdAt = createdAt;
    }

    static CreditLedgerEntity initialAllocation(String userId, String eventId, long amount,
                                                 Instant occurredAt, Instant createdAt) {
        return new CreditLedgerEntity(userId, null, "REGISTRATION_EVENT", eventId,
                null, LedgerEffectType.INITIAL_ALLOCATION, null,
                amount, amount, 0, occurredAt, createdAt);
    }

    static CreditLedgerEntity reservation(String userId, String orderId, long amount, Instant now) {
        return new CreditLedgerEntity(userId, orderId, "ORDER_RESERVATION", orderId,
                null, LedgerEffectType.RESERVATION, null, amount, 0, amount, now, now);
    }

    static CreditLedgerEntity commandReservation(String userId, String orderId, String commandId,
                                                  long amount, Instant now) {
        return new CreditLedgerEntity(userId, orderId, "ORDER_RESERVATION", orderId,
                commandId, LedgerEffectType.RESERVATION, null, amount, 0, amount, now, now);
    }

    static CreditLedgerEntity refund(String userId, String orderId, String eventType,
                                     String eventId, RefundReason reason, long amount,
                                     Instant occurredAt, Instant now) {
        return new CreditLedgerEntity(userId, orderId, eventType, eventId,
                null, LedgerEffectType.REFUND, reason, amount, 0, -amount, occurredAt, now);
    }

    static CreditLedgerEntity commandCompensation(String userId, String orderId, String commandId,
                                                   long amount, Instant now) {
        return new CreditLedgerEntity(userId, orderId, "COMMAND_COMPENSATION", commandId,
                commandId, LedgerEffectType.REFUND, RefundReason.COMPENSATION,
                amount, 0, -amount, now, now);
    }

    static CreditLedgerEntity paymentSent(String userId, String orderId, String eventId,
                                           long amount, Instant occurredAt, Instant now) {
        return new CreditLedgerEntity(userId, orderId, "ORDER_COMPLETION_EVENT", eventId,
                null, LedgerEffectType.PAYMENT_SENT, null,
                amount, -amount, -amount, occurredAt, now);
    }

    static CreditLedgerEntity paymentReceived(String userId, String orderId, String eventId,
                                               long amount, Instant occurredAt, Instant now) {
        return new CreditLedgerEntity(userId, orderId, "ORDER_COMPLETION_EVENT", eventId,
                null, LedgerEffectType.PAYMENT_RECEIVED, null,
                amount, amount, 0, occurredAt, now);
    }

    CreditTransaction toTransaction() {
        CreditTransactionType type = switch (effectType) {
            case INITIAL_ALLOCATION -> CreditTransactionType.INITIAL_ALLOCATION;
            case RESERVATION -> CreditTransactionType.RESERVATION;
            case PAYMENT_SENT -> CreditTransactionType.PAID;
            case PAYMENT_RECEIVED -> CreditTransactionType.RECEIVED;
            case REFUND -> switch (refundReason) {
                case CANCELLATION -> CreditTransactionType.REFUNDED_CANCELLATION;
                case EXPIRY -> CreditTransactionType.REFUNDED_EXPIRY;
                case COMPENSATION -> CreditTransactionType.REFUNDED;
                case null -> CreditTransactionType.REFUNDED;
            };
        };
        CreditDirection direction = switch (effectType) {
            case RESERVATION, PAYMENT_SENT -> CreditDirection.DEBIT;
            default -> CreditDirection.CREDIT;
        };
        return new CreditTransaction(entryId.toString(), userId, type, amount, direction, occurredAt, orderId);
    }
}
