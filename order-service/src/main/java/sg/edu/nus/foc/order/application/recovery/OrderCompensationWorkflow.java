package sg.edu.nus.foc.order.application.recovery;

import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.domain.OrderProblem;

/** One initial financial attempt; all subsequent recovery chooses compensation. */
@Service
@RequiredArgsConstructor
public class OrderCompensationWorkflow {
    private final OrderCommandStore store;
    private final OrderCompensationJournal journal;
    private final ObjectProvider<CreditCommandGateway> gateway;
    private final PlatformTransactionManager transactions;

    public void execute(OrderCommandStore.Entry claim, CreditCommandGateway.Mutation mutation,
            String authorization, Runnable validate, Supplier<OrderResponse> finalizeLocal) {
        if (claim.attempts() > 1 || claim.possibleEffect()) {
            journal.abandon(claim, "RECOVERY_DEADLINE");
            return;
        }
        try {
            validate.run();
            new TransactionTemplate(transactions).executeWithoutResult(tx -> store.markPossibleEffect(claim));
            CreditCommandGateway.Result remote = gateway.getObject().execute(claim.key(), mutation, claim.generation(), authorization);
            if (!remote.applied()) {
                journal.rejected(claim, remote.code());
                return;
            }
            journal.remoteSucceeded(claim);
            new TransactionTemplate(transactions).executeWithoutResult(tx -> {
                store.assertOwned(claim);
                OrderResponse result = java.util.Objects.requireNonNull(finalizeLocal.get(), "A saved local result is required.");
                journal.localSucceeded(claim);
                store.complete(claim, "SUCCESS", "SUCCEEDED", "Request completed.", result);
            });
        } catch (RuntimeException failure) {
            // Rereads the row: an uncertain commit may already have saved SUCCESS.
            // If the database is still unavailable, the original durable intent
            // remains for the sweep; never claim compensation was published.
            if (failure instanceof OrderProblem problem) {
                journal.abandon(claim, problem.getCode(), problem.getMessage());
            } else {
                journal.abandon(claim, "LOCAL_OR_REMOTE_UNCERTAIN");
            }
        }
    }
}
