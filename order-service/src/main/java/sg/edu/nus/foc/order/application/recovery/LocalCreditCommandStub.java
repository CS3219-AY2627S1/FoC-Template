package sg.edu.nus.foc.order.application.recovery;

import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** Explicit process-local protocol stub, NOT verified Credit crash durability. */
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "order.peers.mode", havingValue = "mock", matchIfMissing = true)
public class LocalCreditCommandStub implements CreditCommandGateway {
    private final MockPeerAdapters peers;
    private final Map<String, Saved> results = new HashMap<>();
    private final Map<String, Long> generations = new HashMap<>();
    private record Saved(Mutation mutation, Result result, boolean compensated) { }

    @Override public synchronized Result execute(String key, Mutation mutation, long generation, String authorization) {
        Saved saved = results.get(key);
        if (saved != null && !saved.mutation().equals(mutation)) throw OrderProblem.conflict("Stub command input mismatch.");
        if (generation < generations.getOrDefault(key, 0L)) throw OrderProblem.conflict("Stale stub attempt.");
        generations.put(key, generation);
        if (saved != null) {
            return saved.compensated() ? Result.rejection("COMPENSATED") : saved.result();
        }
        Result result;
        try {
            switch (mutation.kind()) {
                case "CREATE" -> peers.reserve(mutation.orderId(), mutation.actorId(), mutation.amount(), authorization);
                case "ACCEPT" -> peers.assignCourier(mutation.orderId(), mutation.actorId(), authorization);
                case "ABORT" -> peers.holdForReopen(mutation.orderId(), authorization);
                default -> throw new IllegalArgumentException("Unsupported stub mutation.");
            }
            result = Result.success();
        } catch (IllegalStateException rejected) {
            result = Result.rejection(rejected.getMessage().contains("Insufficient") ? "INSUFFICIENT_CREDITS" : "CONFLICT");
        }
        results.put(key, new Saved(mutation, result, false));
        return result;
    }

    @Override public synchronized boolean compensate(String key, Mutation mutation, long generation, String authorization) {
        Saved saved = results.get(key);
        if (saved != null && !saved.mutation().equals(mutation)) return false;
        if (generation < generations.getOrDefault(key, 0L)) return false;
        generations.put(key, generation);
        if (saved != null && saved.compensated()) return true;
        if (saved != null && saved.result().applied()) {
            switch (mutation.kind()) {
                case "CREATE" -> peers.compensateCreation(mutation.orderId());
                case "ACCEPT" -> {
                    if (!mutation.actorId().equals(peers.reservationCourier(mutation.orderId()))) return false;
                    peers.holdForReopen(mutation.orderId(), authorization);
                }
                default -> { return false; }
            }
        }
        // This fences a still-not-applied original key in the stub too.
        results.put(key, new Saved(mutation, Result.rejection("COMPENSATED"), true));
        return true;
    }
}
