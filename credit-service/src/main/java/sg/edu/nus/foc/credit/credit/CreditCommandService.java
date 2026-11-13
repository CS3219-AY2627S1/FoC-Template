/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-11
 * Mode: Code generation.
 * Scope: Generated the credit side command handling service based on the agreed contract.
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.credit;

import org.springframework.stereotype.Service;
import sg.edu.nus.foc.credit.error.CreditCommandException;
import sg.edu.nus.foc.credit.error.ErrorCode;
import sg.edu.nus.foc.credit.error.ForbiddenException;
import sg.edu.nus.foc.credit.error.InvalidCommandHeaderException;
import sg.edu.nus.foc.credit.persistence.CreditCommandStore;
import sg.edu.nus.foc.credit.persistence.CreditCommandStore.Binding;
import sg.edu.nus.foc.credit.persistence.CreditCommandStore.Snapshot;

@Service
public class CreditCommandService {

    private final CreditCommandStore store;
    private final sg.edu.nus.foc.credit.persistence.CreditCompensationStore compensationStore;

    public CreditCommandService(CreditCommandStore store,
                                sg.edu.nus.foc.credit.persistence.CreditCompensationStore compensationStore) {
        this.store = store;
        this.compensationStore = compensationStore;
    }

    public CommandMutationResult<ReservationResult> reserve(String key, long generation,
                                                            String orderId, String requesterId,
                                                            long amount) {
        validate(key, generation, orderId, requesterId);
        if (amount <= 0) {
            throw new InvalidCommandHeaderException("amount", "must be a positive whole number");
        }
        Snapshot registered = store.register(new Binding(key, CreditCommandOperation.RESERVE,
                requesterId, orderId, amount, generation));
        if (registered.result().outcome() != CreditCommandOutcome.PENDING) {
            terminal(registered);
            return store.executeReserve(key, registered.highestGeneration());
        }
        CommandMutationResult<ReservationResult> executed = store.executeReserve(key, generation);
        requireApplied(executed.command(), requesterId);
        return executed;
    }

    public CommandMutationResult<Void> assignCourier(String key, long generation,
                                                      String orderId, String courierId) {
        validate(key, generation, orderId, courierId);
        Snapshot registered = store.register(new Binding(key, CreditCommandOperation.ASSIGN_COURIER,
                courierId, orderId, null, generation));
        if (registered.result().outcome() != CreditCommandOutcome.PENDING) {
            terminal(registered);
            return new CommandMutationResult<>(null, registered.result(), true);
        }
        CommandMutationResult<Void> executed = store.executeAssignCourier(key, generation);
        requireApplied(executed.command(), courierId);
        return executed;
    }

    public CommandMutationResult<Void> clearCourier(String key, long generation,
                                                     String orderId, String courierId) {
        validate(key, generation, orderId, courierId);
        Snapshot registered = store.register(new Binding(key, CreditCommandOperation.CLEAR_COURIER,
                courierId, orderId, null, generation));
        if (registered.result().outcome() != CreditCommandOutcome.PENDING) {
            terminal(registered);
            return new CommandMutationResult<>(null, registered.result(), true);
        }
        CommandMutationResult<Void> executed = store.executeClearCourier(key, generation);
        requireApplied(executed.command(), courierId);
        return executed;
    }

    public CreditCommandResult status(String key, String actorId) {
        CreditService.requireOpaqueId(key, "commandId");
        CreditService.requireOpaqueId(actorId, "actorId");
        return store.findOwned(key, actorId).result();
    }

    public CreditCommandResult compensate(String key, long generation, String actorId,
                                          boolean requester, boolean courier) {
        validateGeneration(generation);
        CreditService.requireOpaqueId(key, "commandId");
        Snapshot owned = store.findOwned(key, actorId);
        boolean permitted = owned.result().operation() == CreditCommandOperation.RESERVE
                ? requester : courier;
        if (!permitted) {
            throw new ForbiddenException("The caller lacks permission to compensate this Credit command.");
        }
        sg.edu.nus.foc.credit.persistence.CreditCompensationStore.ExistingResult result =
                compensationStore.compensateExisting(key, generation, actorId);
        if (result.reconciliationRequired()) {
            throw new CreditCommandException(ErrorCode.RECONCILIATION_REQUIRED,
                    "The Credit effect cannot be reversed safely and requires reconciliation.",
                    key, result.result().outcome());
        }
        return result.result();
    }

    private void requireApplied(CreditCommandResult result, String actorId) {
        if (result.outcome() != CreditCommandOutcome.APPLIED) {
            terminal(store.findOwned(result.commandId(), actorId));
        }
    }

    private void terminal(Snapshot command) {
        CreditCommandResult result = command.result();
        switch (result.outcome()) {
            case APPLIED -> {
                return;
            }
            case REJECTED -> {
                ErrorCode error = storedError(result.code());
                throw new CreditCommandException(error, store.savedFailureMessage(command),
                        result.commandId(), result.outcome());
            }
            case COMPENSATED -> throw new CreditCommandException(ErrorCode.COMMAND_COMPENSATED,
                    "The Credit command has already been compensated and cannot be applied.",
                    result.commandId(), result.outcome());
            case PENDING -> throw new IllegalStateException("Credit command execution remained pending.");
        }
    }

    private static ErrorCode storedError(String code) {
        try {
            return ErrorCode.valueOf(code);
        } catch (IllegalArgumentException invalid) {
            return ErrorCode.CONFLICT;
        }
    }

    private static void validate(String key, long generation, String orderId, String actorId) {
        CreditService.requireOpaqueId(key, "commandId");
        CreditService.requireOpaqueId(orderId, "orderId");
        CreditService.requireOpaqueId(actorId, "actorId");
        validateGeneration(generation);
    }

    private static void validateGeneration(long generation) {
        if (generation <= 0) {
            throw new InvalidCommandHeaderException(
                    "X-Command-Generation", "must be a positive whole number");
        }
    }
}
