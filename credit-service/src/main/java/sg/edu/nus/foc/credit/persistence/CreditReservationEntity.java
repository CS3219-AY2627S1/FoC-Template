/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-07
 * Mode: Boilerplate generation.
 * Scope: Generated the JPA credit reservation entity based on the provided PostgreSQL schema and requirements.
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
import sg.edu.nus.foc.credit.credit.CreditReservation;
import sg.edu.nus.foc.credit.credit.ReservationStatus;

@Entity
@Table(name = "credit_reservations")
public class CreditReservationEntity {

    @Id
    @Column(name = "order_id", length = 128)
    private String orderId;

    @Column(name = "requester_id", nullable = false, length = 128)
    private String requesterId;

    @Column(name = "courier_id", length = 128)
    private String courierId;

    @Column(nullable = false)
    private long amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ReservationStatus status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "refunded_at")
    private Instant refundedAt;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "reserve_command_id", length = 128)
    private String reserveCommandId;

    @Column(name = "courier_assignment_command_id", length = 128)
    private String courierAssignmentCommandId;

    @Column(name = "mutation_revision", nullable = false)
    private long mutationRevision;

    @Column(name = "last_mutation_identity", length = 128)
    private String lastMutationIdentity;

    @Column(name = "courier_assignment_identity", length = 128)
    private String courierAssignmentIdentity;

    protected CreditReservationEntity() {
    }

    CreditReservation toDomain() {
        return new CreditReservation(orderId, requesterId, courierId, amount, status,
                createdAt, updatedAt, refundedAt, paidAt);
    }

    String requesterId() {
        return requesterId;
    }

    long amount() {
        return amount;
    }

    String courierId() {
        return courierId;
    }

    ReservationStatus status() {
        return status;
    }

    String reserveCommandId() {
        return reserveCommandId;
    }

    String courierAssignmentCommandId() {
        return courierAssignmentCommandId;
    }

    long mutationRevision() {
        return mutationRevision;
    }

    String lastMutationIdentity() {
        return lastMutationIdentity;
    }

    String courierAssignmentIdentity() {
        return courierAssignmentIdentity;
    }

    void assignCourier(String courierId, Instant now) {
        assignCourier(courierId, null, java.util.UUID.randomUUID().toString(), now);
    }

    void assignCourier(String courierId, String commandId, Instant now) {
        assignCourier(courierId, commandId, commandId, now);
    }

    void assignCourier(String courierId, String commandId, String assignmentIdentity, Instant now) {
        this.courierId = courierId;
        courierAssignmentCommandId = commandId;
        courierAssignmentIdentity = assignmentIdentity;
        advanceMutation(assignmentIdentity, now);
    }

    void restoreCourier(String courierId, String assignmentIdentity, Instant now) {
        this.courierId = courierId;
        courierAssignmentCommandId = null;
        courierAssignmentIdentity = assignmentIdentity;
        advanceMutation(assignmentIdentity, now);
    }

    void clearCourier(String mutationIdentity, Instant now) {
        courierId = null;
        courierAssignmentCommandId = null;
        courierAssignmentIdentity = null;
        advanceMutation(mutationIdentity, now);
    }

    void clearCourier(Instant now) {
        clearCourier(java.util.UUID.randomUUID().toString(), now);
    }

    private void advanceMutation(String mutationIdentity, Instant now) {
        mutationRevision++;
        lastMutationIdentity = mutationIdentity;
        updatedAt = now;
    }

    void refund(String mutationIdentity, Instant now) {
        status = ReservationStatus.REFUNDED;
        refundedAt = now;
        paidAt = null;
        advanceMutation(mutationIdentity, now);
    }

    void refund(Instant now) {
        refund(java.util.UUID.randomUUID().toString(), now);
    }

    void markPaid(String mutationIdentity, Instant now) {
        status = ReservationStatus.PAID;
        paidAt = now;
        refundedAt = null;
        advanceMutation(mutationIdentity, now);
    }

    void markPaid(Instant now) {
        markPaid(java.util.UUID.randomUUID().toString(), now);
    }
}
