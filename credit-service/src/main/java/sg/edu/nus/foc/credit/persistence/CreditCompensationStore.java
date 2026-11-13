/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-27
 * Mode: Code generation and implementation assistance.
 * Scope: Generated the Credit compensation workflow implementation from the approved cross-service contract.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.credit.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.ReservationStatus;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.EventConflictException;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.error.ErrorCode;
import sg.edu.nus.foc.credit.messaging.CreditCompensationRequest;
import sg.edu.nus.foc.credit.messaging.CreditCompensationResult;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class CreditCompensationStore {

    public record Processed(String resultEventId, CreditCompensationResult result, boolean replayed) {
    }

    public record ExistingResult(sg.edu.nus.foc.credit.credit.CreditCommandResult result,
                                 boolean reconciliationRequired) {
    }

    private record Resolution(String outcome, String code) {
        static Resolution compensated(String code) { return new Resolution("COMPENSATED", code); }
        static Resolution reconcile(String code) {
            return new Resolution("RECONCILIATION_REQUIRED", code);
        }
    }

    private final CreditCommandJpaRepository commands;
    private final CreditReservationJpaRepository reservations;
    private final CreditAccountJpaRepository accounts;
    private final CreditLedgerJpaRepository ledger;
    private final CreditCompensationInboxJpaRepository inbox;
    private final CreditCompensationResultOutboxJpaRepository outbox;
    private final JsonMapper mapper;
    private final Clock clock;

    public CreditCompensationStore(CreditCommandJpaRepository commands,
                                   CreditReservationJpaRepository reservations,
                                   CreditAccountJpaRepository accounts,
                                   CreditLedgerJpaRepository ledger,
                                   CreditCompensationInboxJpaRepository inbox,
                                   CreditCompensationResultOutboxJpaRepository outbox,
                                   JsonMapper mapper,
                                   Clock clock) {
        this.commands = commands;
        this.reservations = reservations;
        this.accounts = accounts;
        this.ledger = ledger;
        this.inbox = inbox;
        this.outbox = outbox;
        this.mapper = mapper;
        this.clock = clock;
    }

    @Transactional
    public Processed process(CreditCompensationRequest request) {
        CreditCommandOperation operation = CreditCommandOperation.valueOf(request.operation());
        CreditCommandStore.Binding binding = new CreditCommandStore.Binding(
                request.commandId(), operation, request.actorId(), request.orderId(),
                request.amount(), request.generation());
        String bindingHash = CreditCommandStore.bindingHash(binding);
        String payloadHash = payloadHash(request);
        Instant now = clock.instant();

        CreditCompensationInboxEntity prior = inbox.findByEventIdForUpdate(request.eventId()).orElse(null);
        if (prior != null) {
            return replay(prior, request, bindingHash, payloadHash, now);
        }

        commands.insertCompensatedIfAbsent(request.commandId(), operation, request.actorId(),
                request.orderId(), request.amount(), bindingHash, request.generation(), now);
        CreditCommandRecordEntity command = commands.findByCommandIdForUpdate(request.commandId())
                .orElseThrow();

        // The command lock also serializes two compensation IDs racing on their
        // first insert. Re-read after obtaining it because the other transaction
        // may have committed its inbox row while this transaction was waiting.
        prior = inbox.findByEventIdForUpdate(request.eventId()).orElse(null);
        if (prior != null) {
            return replay(prior, request, bindingHash, payloadHash, now);
        }
        if (inbox.findByCommandId(request.commandId()).isPresent()) {
            throw new EventConflictException(request.eventId());
        }

        Resolution resolution;
        boolean sameBinding = command.operation() == operation
                && command.actorId().equals(request.actorId())
                && command.orderId().equals(request.orderId())
                && Objects.equals(command.amount(), request.amount())
                && command.payloadHash().equals(bindingHash);
        if (!sameBinding) {
            resolution = Resolution.reconcile("COMMAND_BINDING_MISMATCH");
        } else if (request.generation() < command.highestGeneration()) {
            resolution = Resolution.reconcile("STALE_GENERATION");
        } else {
            if (request.generation() > command.highestGeneration()) {
                command.advanceGeneration(request.generation(), now);
            }
            resolution = resolve(command, now);
        }

        long resolutionRevision = command.nextProviderResolutionRevision();
        String resultId = resultId(request.eventId(), resolution.outcome(), resolutionRevision);
        CreditCompensationResult result = new CreditCompensationResult(
                resultId, request.eventId(), request.commandId(), request.operation(), request.orderId(),
                request.generation(), resolution.outcome(), resolution.code());
        String payload = json(result);

        inbox.save(new CreditCompensationInboxEntity(request.eventId(), request.commandId(),
                request.generation(), bindingHash, payloadHash, resolution.outcome(), resolution.code(),
                resultId, resolutionRevision, now));
        outbox.save(new CreditCompensationResultOutboxEntity(resultId, request.eventId(),
                request.commandId(), resolutionRevision, payload, now));
        return new Processed(resultId, result, false);
    }

    private Processed replay(CreditCompensationInboxEntity prior,
                             CreditCompensationRequest request,
                             String bindingHash, String payloadHash, Instant now) {
        requireSameRequest(prior, request, bindingHash, payloadHash);
        CreditCompensationResultOutboxEntity saved = outbox.findByEventIdForUpdate(prior.resultEventId())
                .orElseThrow();
        saved.requeuePublished(now);
        return new Processed(saved.eventId(), readResult(saved.payload()), true);
    }

    @Transactional
    public ExistingResult compensateExisting(String commandId, long generation, String actorId) {
        CreditCommandRecordEntity command = commands.findByCommandIdForUpdate(commandId)
                .orElseThrow(() -> new CreditCommandException(ErrorCode.COMMAND_NOT_FOUND,
                        "No committed Credit command exists for this key.", commandId, null));
        if (!command.actorId().equals(actorId)) {
            throw new sg.edu.nus.foc.credit.error.ForbiddenException(
                    "Only the command owner may access this Credit command.");
        }
        if (generation < command.highestGeneration()) {
            throw new CreditCommandException(ErrorCode.STALE_COMMAND_GENERATION,
                    "The command generation is older than the highest accepted generation.",
                    commandId, command.outcome());
        }
        Instant now = clock.instant();
        if (generation > command.highestGeneration()) {
            command.advanceGeneration(generation, now);
        }
        Resolution resolution = resolve(command, now);
        command.nextProviderResolutionRevision();
        return new ExistingResult(command.toResult(),
                "RECONCILIATION_REQUIRED".equals(resolution.outcome()));
    }

    private Resolution resolve(CreditCommandRecordEntity command, Instant now) {
        if (command.outcome() == CreditCommandOutcome.COMPENSATED) {
            return Resolution.compensated(command.code());
        }
        if (command.outcome() == CreditCommandOutcome.PENDING
                || command.outcome() == CreditCommandOutcome.REJECTED) {
            command.complete(CreditCommandOutcome.COMPENSATED, "FENCED_NO_EFFECT", null, now);
            return Resolution.compensated("FENCED_NO_EFFECT");
        }
        return switch (command.operation()) {
            case RESERVE -> reverseReserve(command, now);
            case ASSIGN_COURIER -> reverseAssignment(command, now);
            case CLEAR_COURIER -> reverseClear(command, now);
        };
    }

    private Resolution reverseReserve(CreditCommandRecordEntity command, Instant now) {
        CreditReservationEntity reservation = reservations.findByOrderIdForUpdate(command.orderId())
                .orElse(null);
        if (reservation == null || command.effectRevision() == null) {
            return Resolution.reconcile("PREIMAGE_UNAVAILABLE");
        }
        if (reservation.status() != ReservationStatus.RESERVED) {
            return Resolution.reconcile("ALREADY_SETTLED");
        }
        if (!command.commandId().equals(reservation.reserveCommandId())
                || reservation.courierId() != null
                || reservation.mutationRevision() != command.effectRevision()) {
            return Resolution.reconcile("REVISION_CHANGED");
        }
        CreditAccountEntity account = accounts.findByUserIdForUpdate(command.actorId())
                .orElseThrow(() -> new AccountNotFoundException(command.actorId()));
        account.release(reservation.amount(), now);
        reservation.refund(command.commandId(), now);
        ledger.save(CreditLedgerEntity.commandCompensation(command.actorId(), command.orderId(),
                command.commandId(), reservation.amount(), now));
        command.complete(CreditCommandOutcome.COMPENSATED, "REVERSED", null, now);
        return Resolution.compensated("REVERSED");
    }

    private Resolution reverseAssignment(CreditCommandRecordEntity command, Instant now) {
        CreditReservationEntity reservation = reservations.findByOrderIdForUpdate(command.orderId())
                .orElse(null);
        if (reservation == null || command.effectRevision() == null) {
            return Resolution.reconcile("PREIMAGE_UNAVAILABLE");
        }
        if (reservation.status() != ReservationStatus.RESERVED) {
            return Resolution.reconcile("ALREADY_SETTLED");
        }
        if (!command.commandId().equals(reservation.courierAssignmentCommandId())
                || !command.commandId().equals(reservation.courierAssignmentIdentity())
                || !command.actorId().equals(reservation.courierId())
                || reservation.mutationRevision() != command.effectRevision()) {
            return Resolution.reconcile("REVISION_CHANGED");
        }
        reservation.clearCourier(command.commandId(), now);
        command.complete(CreditCommandOutcome.COMPENSATED, "REVERSED", null, now);
        return Resolution.compensated("REVERSED");
    }

    private Resolution reverseClear(CreditCommandRecordEntity command, Instant now) {
        CreditReservationEntity reservation = reservations.findByOrderIdForUpdate(command.orderId())
                .orElse(null);
        if (reservation == null || command.effectRevision() == null || command.priorRevision() == null
                || command.priorCourierId() == null || command.priorAssignmentIdentity() == null) {
            return Resolution.reconcile("PREIMAGE_UNAVAILABLE");
        }
        if (reservation.status() != ReservationStatus.RESERVED) {
            return Resolution.reconcile("ALREADY_SETTLED");
        }
        if (reservation.courierId() != null
                || reservation.mutationRevision() != command.effectRevision()
                || !command.commandId().equals(reservation.lastMutationIdentity())) {
            return Resolution.reconcile("REVISION_CHANGED");
        }
        reservation.restoreCourier(command.priorCourierId(), command.priorAssignmentIdentity(), now);
        command.complete(CreditCommandOutcome.COMPENSATED, "REVERSED", null, now);
        return Resolution.compensated("REVERSED");
    }

    private static void requireSameRequest(CreditCompensationInboxEntity prior,
                                           CreditCompensationRequest request,
                                           String bindingHash, String payloadHash) {
        if (!prior.commandId().equals(request.commandId())
                || prior.generation() != request.generation()
                || !prior.bindingHash().equals(bindingHash)
                || !prior.payloadHash().equals(payloadHash)) {
            throw new EventConflictException(request.eventId());
        }
    }

    private CreditCompensationResult readResult(String payload) {
        try {
            return mapper.readValue(payload, CreditCompensationResult.class);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Saved compensation result is invalid.", exception);
        }
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Compensation result could not be serialized.", exception);
        }
    }

    static String payloadHash(CreditCompensationRequest request) {
        String canonical = String.join("\n", request.eventId(), request.commandId(), request.operation(),
                request.orderId(), request.actorId(), Long.toString(request.generation()),
                request.amount() == null ? "" : request.amount().toString());
        return sha256(canonical);
    }

    static String resultId(String compensationId, String outcome, long resolutionRevision) {
        String canonical = "CreditCompensationResult\n" + compensationId + "\n" + outcome
                + "\n" + resolutionRevision;
        return UUID.nameUUIDFromBytes(canonical.getBytes(StandardCharsets.UTF_8)).toString();
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
