/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Code generation.
 * Scope: Generated credit command handling based on the agreed contract.
 * Author review: I reviewed for correctness and edited where needed.
 */


package sg.edu.nus.foc.credit.persistence;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Objects;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.credit.credit.CommandMutationResult;
import sg.edu.nus.foc.credit.credit.CreditCommandOperation;
import sg.edu.nus.foc.credit.credit.CreditCommandOutcome;
import sg.edu.nus.foc.credit.credit.CreditCommandResult;
import sg.edu.nus.foc.credit.credit.ReservationResult;
import sg.edu.nus.foc.credit.credit.ReservationStatus;
import sg.edu.nus.foc.credit.error.AccountNotFoundException;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.error.ErrorCode;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.error.InsufficientCreditsException;
import sg.edu.nus.foc.credit.error.ReservationConflictException;
import sg.edu.nus.foc.credit.error.ReservationNotFoundException;
import sg.edu.nus.foc.credit.error.ReservationStateConflictException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class CreditCommandStore {

    private final CreditCommandJpaRepository commands;
    private final CreditAccountJpaRepository accounts;
    private final CreditReservationJpaRepository reservations;
    private final CreditLedgerJpaRepository ledger;
    private final JsonMapper mapper;
    private final Clock clock;

    public CreditCommandStore(CreditCommandJpaRepository commands,
                              CreditAccountJpaRepository accounts,
                              CreditReservationJpaRepository reservations,
                              CreditLedgerJpaRepository ledger,
                              JsonMapper mapper,
                              Clock clock) {
        this.commands = commands;
        this.accounts = accounts;
        this.reservations = reservations;
        this.ledger = ledger;
        this.mapper = mapper;
        this.clock = clock;
    }

    public record Binding(String commandId, CreditCommandOperation operation, String actorId,
                          String orderId, Long amount, long generation) {
    }

    public record Snapshot(CreditCommandResult result, String actorId, Long amount,
                           long highestGeneration, String resultJson) {
    }

    private record SavedFailure(String code, String message) {
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Snapshot register(Binding binding) {
        Instant now = clock.instant();
        String hash = bindingHash(binding);
        commands.insertIfAbsent(binding.commandId(), binding.operation(), binding.actorId(),
                binding.orderId(), binding.amount(), hash, binding.generation(), now);
        CreditCommandRecordEntity command = lockedCommand(binding.commandId());
        if (!sameBinding(command, binding, hash)) {
            throw commandError(ErrorCode.IDEMPOTENCY_KEY_REUSED, binding.commandId(), null,
                    "The idempotency key is already bound to different command input.");
        }
        if (binding.generation() < command.highestGeneration()
                && command.outcome() == CreditCommandOutcome.PENDING) {
            throw stale(binding.commandId());
        }
        if (binding.generation() > command.highestGeneration()) {
            command.advanceGeneration(binding.generation(), now);
        }
        return snapshot(command);
    }

    @Transactional(readOnly = true)
    public Snapshot findOwned(String commandId, String actorId) {
        CreditCommandRecordEntity command = commands.findById(commandId)
                .orElseThrow(() -> commandError(ErrorCode.COMMAND_NOT_FOUND, commandId, null,
                        "No committed Credit command exists for this key."));
        requireOwner(command, actorId);
        return snapshot(command);
    }

    @Transactional
    public CommandMutationResult<ReservationResult> executeReserve(String commandId, long generation) {
        CreditCommandRecordEntity command = lockedForExecution(
                commandId, generation, CreditCommandOperation.RESERVE);
        if (command.outcome() != CreditCommandOutcome.PENDING) {
            return new CommandMutationResult<>(savedReservation(command), command.toResult(), true);
        }
        CreditReservationEntity insertedReservation = null;
        try {
            Instant now = clock.instant();
            int created = reservations.insertIfAbsent(command.orderId(), command.actorId(),
                    command.amount(), command.commandId(), command.commandId(), now);
            CreditReservationEntity reservation = reservations.findByOrderIdForUpdate(command.orderId())
                    .orElseThrow();
            if (created == 0) {
                throw new ReservationConflictException(command.orderId());
            }
            insertedReservation = reservation;
            CreditAccountEntity account = accounts.findByUserIdForUpdate(command.actorId())
                    .orElseThrow(() -> new AccountNotFoundException(command.actorId()));
            if (account.toDomain().usableBalance() < command.amount()) {
                throw new InsufficientCreditsException(account.toDomain().usableBalance(), command.amount());
            }
            account.reserve(command.amount(), now);
            ledger.save(CreditLedgerEntity.commandReservation(
                    command.actorId(), command.orderId(), command.commandId(), command.amount(), now));
            ReservationResult result = new ReservationResult(
                    reservation.toDomain(), account.toDomain(), true);
            command.recordEffect(reservation.mutationRevision());
            command.complete(CreditCommandOutcome.APPLIED, "SUCCEEDED", json(result), now);
            return new CommandMutationResult<>(result, command.toResult(), false);
        } catch (RuntimeException failure) {
            if (!isDefiniteBusinessFailure(failure)) {
                throw failure;
            }
            if (insertedReservation != null) {
                reservations.delete(insertedReservation);
            }
            reject(command, failure);
            return new CommandMutationResult<>(null, command.toResult(), false);
        }
    }

    @Transactional
    public CommandMutationResult<Void> executeAssignCourier(String commandId, long generation) {
        CreditCommandRecordEntity command = lockedForExecution(
                commandId, generation, CreditCommandOperation.ASSIGN_COURIER);
        if (command.outcome() != CreditCommandOutcome.PENDING) {
            return new CommandMutationResult<>(null, command.toResult(), true);
        }
        try {
            CreditReservationEntity reservation = lockedReservation(command.orderId());
            requireReserved(reservation, command.orderId());
            if (reservation.requesterId().equals(command.actorId())) {
                throw new ForbiddenException("The requester cannot be assigned as courier for the same order.");
            }
            if (reservation.courierId() != null) {
                throw new ReservationStateConflictException(command.orderId(),
                        "is already assigned and cannot be proven to belong to this command.");
            }
            if (!accounts.existsById(command.actorId())) {
                throw new AccountNotFoundException(command.actorId());
            }
            Instant now = clock.instant();
            reservation.assignCourier(command.actorId(), command.commandId(), now);
            command.recordEffect(reservation.mutationRevision());
            command.complete(CreditCommandOutcome.APPLIED, "SUCCEEDED", null, now);
            return new CommandMutationResult<>(null, command.toResult(), false);
        } catch (RuntimeException failure) {
            if (!isDefiniteBusinessFailure(failure)) {
                throw failure;
            }
            reject(command, failure);
            return new CommandMutationResult<>(null, command.toResult(), false);
        }
    }

    @Transactional
    public CommandMutationResult<Void> executeClearCourier(String commandId, long generation) {
        CreditCommandRecordEntity command = lockedForExecution(
                commandId, generation, CreditCommandOperation.CLEAR_COURIER);
        if (command.outcome() != CreditCommandOutcome.PENDING) {
            return new CommandMutationResult<>(null, command.toResult(), true);
        }
        try {
            CreditReservationEntity reservation = lockedReservation(command.orderId());
            requireReserved(reservation, command.orderId());
            if (!command.actorId().equals(reservation.courierId())) {
                throw new ForbiddenException(
                        "Only the assigned courier may reset this credit reservation.");
            }
            Instant now = clock.instant();
            command.recordClearPreimage(reservation.courierId(),
                    reservation.courierAssignmentIdentity(), reservation.mutationRevision());
            reservation.clearCourier(command.commandId(), now);
            command.recordEffect(reservation.mutationRevision());
            command.complete(CreditCommandOutcome.APPLIED, "SUCCEEDED", null, now);
            return new CommandMutationResult<>(null, command.toResult(), false);
        } catch (RuntimeException failure) {
            if (!isDefiniteBusinessFailure(failure)) {
                throw failure;
            }
            reject(command, failure);
            return new CommandMutationResult<>(null, command.toResult(), false);
        }
    }

    private CreditCommandRecordEntity lockedForExecution(String commandId, long generation,
                                                          CreditCommandOperation expectedOperation) {
        CreditCommandRecordEntity command = lockedCommand(commandId);
        if (command.operation() != expectedOperation) {
            throw commandError(ErrorCode.IDEMPOTENCY_KEY_REUSED, commandId, command.outcome(),
                    "The idempotency key is bound to a different operation.");
        }
        if (command.outcome() == CreditCommandOutcome.COMPENSATED) {
            return command;
        }
        if (generation < command.highestGeneration()
                && command.outcome() == CreditCommandOutcome.PENDING) {
            throw stale(commandId);
        }
        return command;
    }

    private CreditCommandRecordEntity lockedCommand(String commandId) {
        return commands.findByCommandIdForUpdate(commandId)
                .orElseThrow(() -> commandError(ErrorCode.COMMAND_NOT_FOUND, commandId, null,
                        "No committed Credit command exists for this key."));
    }

    private CreditReservationEntity lockedReservation(String orderId) {
        return reservations.findByOrderIdForUpdate(orderId)
                .orElseThrow(() -> new ReservationNotFoundException(orderId));
    }

    private static void requireReserved(CreditReservationEntity reservation, String orderId) {
        if (reservation.status() != ReservationStatus.RESERVED) {
            throw new ReservationStateConflictException(orderId,
                    "is not active; current state is " + reservation.status() + ".");
        }
    }

    private void reject(CreditCommandRecordEntity command, RuntimeException failure) {
        ErrorCode error = businessError(failure);
        command.complete(CreditCommandOutcome.REJECTED, error.name(),
                json(new SavedFailure(error.name(), failure.getMessage())), clock.instant());
    }

    private ReservationResult savedReservation(CreditCommandRecordEntity command) {
        if (command.outcome() != CreditCommandOutcome.APPLIED || command.resultJson() == null) {
            return null;
        }
        try {
            return mapper.readValue(command.resultJson(), ReservationResult.class);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Saved Credit command result is invalid.", exception);
        }
    }

    public String savedFailureMessage(Snapshot command) {
        if (command.resultJson() == null) {
            return "The Credit command was rejected.";
        }
        try {
            return mapper.readValue(command.resultJson(), SavedFailure.class).message();
        } catch (JacksonException exception) {
            throw new IllegalStateException("Saved Credit command rejection is invalid.", exception);
        }
    }

    private String json(Object value) {
        try {
            return mapper.writeValueAsString(value);
        } catch (JacksonException exception) {
            throw new IllegalStateException("Credit command result could not be serialized.", exception);
        }
    }

    private static boolean sameBinding(CreditCommandRecordEntity command, Binding binding, String hash) {
        return command.operation() == binding.operation()
                && command.actorId().equals(binding.actorId())
                && command.orderId().equals(binding.orderId())
                && Objects.equals(command.amount(), binding.amount())
                && command.payloadHash().equals(hash);
    }

    private static void requireOwner(CreditCommandRecordEntity command, String actorId) {
        if (!command.actorId().equals(actorId)) {
            throw new ForbiddenException("Only the command owner may access this Credit command.");
        }
    }

    private static boolean isDefiniteBusinessFailure(RuntimeException failure) {
        return failure instanceof AccountNotFoundException
                || failure instanceof InsufficientCreditsException
                || failure instanceof ReservationConflictException
                || failure instanceof ReservationNotFoundException
                || failure instanceof ReservationStateConflictException
                || failure instanceof ForbiddenException;
    }

    private static ErrorCode businessError(RuntimeException failure) {
        if (failure instanceof AccountNotFoundException) {
            return ErrorCode.ACCOUNT_NOT_FOUND;
        }
        if (failure instanceof InsufficientCreditsException) {
            return ErrorCode.INSUFFICIENT_CREDITS;
        }
        if (failure instanceof ReservationNotFoundException) {
            return ErrorCode.RESERVATION_NOT_FOUND;
        }
        if (failure instanceof ReservationConflictException
                || failure instanceof ReservationStateConflictException) {
            return ErrorCode.RESERVATION_CONFLICT;
        }
        return ErrorCode.FORBIDDEN;
    }

    private static Snapshot snapshot(CreditCommandRecordEntity command) {
        return new Snapshot(command.toResult(), command.actorId(), command.amount(),
                command.highestGeneration(), command.resultJson());
    }

    private static CreditCommandException stale(String commandId) {
        return commandError(ErrorCode.STALE_COMMAND_GENERATION, commandId, null,
                "The command generation is older than the highest accepted generation.");
    }

    private static CreditCommandException commandError(ErrorCode code, String commandId,
                                                       CreditCommandOutcome outcome, String message) {
        return new CreditCommandException(code, message, commandId, outcome);
    }

    static String bindingHash(Binding binding) {
        String canonical = binding.operation().name() + "\n" + binding.actorId() + "\n"
                + binding.orderId() + "\n" + (binding.amount() == null ? "" : binding.amount());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable", impossible);
        }
    }
}
