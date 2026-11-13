package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.RepostPlan;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderRepostService {
    private final OrderRepository orders;
    private final OrderCheckpointRepository checkpoints;
    private final CommandReceiptRepository receipts;
    private final SupplierServicePort suppliers;
    private final CreditServicePort credits;
    private final UserServicePort users;
    private final OrderAuditLogger audit;
    private final RepostFailureRecorder failures;

    @org.springframework.beans.factory.annotation.Value("${order.commands.recovery-policy:retry}")
    private String recoveryPolicy = "retry";

    @org.springframework.beans.factory.annotation.Value("${order.peers.mode:mock}")
    private String peersMode = "mock";

    @Transactional
    public Order configure(
            String commandId,
            String id,
            String actor,
            long version,
            RepostPlan plan,
            String authorization) {
        throw OrderProblem.conflict(
                "Automatic repost settings must be chosen when the order is created.");
    }

    @Transactional
    public Order automatic(String commandId, String id, Instant now, String authorization) {
        if ("http".equals(peersMode)) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Automatic repost requires its durable server-owned command.");
        }
        Optional<CommandReceipt> previous = receipts.findExisting(
                "AUTO_REPOST",
                commandId);
        if (previous.isPresent()) {
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order original = findForUpdate(id);
        if (!original.eligibleForAutomaticRepost(now)) {
            throw OrderProblem.conflict("Order is not eligible for automatic repost.");
        }

        RepostPlan plan = original.getRepostPlan();
        Order repost = prepareRepost(original,
                original.getItemDescription(),
                plan.getCreditAmount(),
                plan.getDeliveryDurationMinutes(),
                now,
                plan.getExpiresAt(), authorization, false);

        return saveRepost("AUTO_REPOST", commandId, original, repost, now, authorization,
                CommandReceipt.fingerprint("AUTO_REPOST", id));
    }

    @Transactional
    public Order manual(
            String commandId,
            String id,
            String actor,
            long version,
            String description,
            long creditsAmount,
            int duration,
            Instant expiresAt,
            String authorization) {
        String authenticatedActor = users.verifyRequester(actor, authorization);
        String fingerprint = CommandReceipt.fingerprint("MANUAL_REPOST", id, authenticatedActor, version,
                description, creditsAmount, duration, expiresAt);
        Optional<CommandReceipt> previous = receipts.findExisting(
                "MANUAL_REPOST",
                commandId);
        if (previous.isPresent()) {
            Order repost = orders.get(previous.get().getOrderId()).orElseThrow();
            if (!repost.getRequesterId().equals(authenticatedActor)) {
                throw OrderProblem.forbidden("Only the requester may repost.");
            }
            if (!id.equals(repost.getOriginalOrderId())) {
                throw OrderProblem.conflict("Command ID was already used for a different original order.");
            }
            previous.get().requireBinding(repost.getId(), authenticatedActor, fingerprint);
            return repost;
        }

        Order original = findForUpdate(id);
        original.requireVersion(version);

        if (!original.getRequesterId().equals(authenticatedActor)) {
            throw OrderProblem.forbidden("Only the requester may repost.");
        }
        if (original.getStatus() != OrderStatus.EXPIRED) {
            throw OrderProblem.conflict("Only an expired order may be reposted.");
        }

        Instant createdAt = Instant.now();
        Order repost = prepareRepost(original,
                description,
                creditsAmount,
                duration,
                createdAt,
                expiresAt, authorization, true);

        return saveRepost(
                "MANUAL_REPOST",
                commandId,
                original,
                repost,
                createdAt,
                authorization,
                fingerprint);
    }

    /** Called only after the durable coordinator confirmed candidate reservation. No peer I/O. */
    @Transactional
    public Order manualConfirmed(String commandId, String id, String candidateId, String actor, long version,
            String description, long amount, int duration, Instant submittedAt, Instant expiresAt) {
        Order original = findForUpdate(id);
        original.requireVersion(version);
        if (!original.getRequesterId().equals(actor)) {
            throw OrderProblem.forbidden("Only the requester may repost.");
        }
        Instant now = Instant.now();
        Order repost = original.createManualRepostWithId(candidateId, description, amount, duration,
                submittedAt, now, expiresAt);
        String fingerprint = CommandReceipt.fingerprint("MANUAL_REPOST", id, actor, version,
                description, amount, duration, expiresAt);
        return saveRepost("MANUAL_REPOST", commandId, original, repost, now, null, fingerprint);
    }

    @Transactional
    public Order automaticConfirmed(String commandId, String id, String candidateId, long version) {
        Order original = findForUpdate(id);
        original.requireVersion(version);
        Instant now = Instant.now();
        if (!original.eligibleForAutomaticRepost(now)) {
            throw OrderProblem.conflict("Order is no longer eligible for automatic repost.");
        }
        RepostPlan plan = original.getRepostPlan();
        Order repost = original.createRepostWithId(candidateId, original.getItemDescription(),
                plan.getCreditAmount(), plan.getDeliveryDurationMinutes(), now, plan.getExpiresAt());
        return saveRepost("AUTO_REPOST", commandId, original, repost, now, null,
                CommandReceipt.fingerprint("AUTO_REPOST", id));
    }

    private Order saveRepost(
            String operation,
            String commandId,
            Order original,
            Order repost,
            Instant createdAt,
            String authorization,
            String fingerprint) {
        original.linkRepost(repost.getId());
        orders.save(original);
        Order saved = orders.save(repost);

        checkpoints.save(new OrderCheckpoint(
                saved.getId(),
                saved.getStatus(),
                createdAt,
                saved.getRequesterId(),
                null));
        receipts.save(new CommandReceipt(operation, commandId, saved.getId(), Instant.now())
                .bind(saved.getRequesterId(), fingerprint));
        audit.dependency("credit-service", "reserve", saved.getId(), "accepted");
        audit.action(operation, saved.getId(), saved.getRequesterId(), commandId, "accepted");
        return saved;
    }

    private Order prepareRepost(Order original, String description, long amount, int duration,
            Instant createdAt, Instant expiresAt, String authorization, boolean manual) {
        if ("compensate".equals(recoveryPolicy)) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Repost must use the durable command protocol; automatic delegated execution is unavailable.");
        }
        try {
            Order repost = manual
                    ? original.createManualRepost(description, amount, duration, createdAt, expiresAt)
                    : original.createRepost(description, amount, duration, createdAt, expiresAt);
            suppliers.validatePair(original.getPickupSupplierId(), original.getDeliverySupplierId(), authorization);
            credits.reserve(repost.getId(), repost.getRequesterId(), repost.getOfferedCredits(), authorization);
            return repost;
        } catch (OrderProblem problem) {
            recordAfterRollback(original.getId(), problem.getCode());
            throw problem;
        } catch (RestClientException exception) {
            String code = "SERVICE_UNAVAILABLE";
            if (exception instanceof RestClientResponseException response) {
                code = switch (response.getStatusCode().value()) {
                    case 400, 422 -> "VALIDATION_ERROR";
                    case 401 -> "UNAUTHENTICATED";
                    case 403 -> "FORBIDDEN";
                    case 404 -> "NOT_FOUND";
                    case 409 -> "CONFLICT";
                    default -> "SERVICE_UNAVAILABLE";
                };
            }
            recordAfterRollback(original.getId(), code);
            throw new OrderProblem(code, "A required service could not approve the repost.");
        }
    }

    // A failed attempt must roll back; its latest outcome is a separate committed transaction.
    private void recordAfterRollback(String id, String code) {
        Instant occurredAt = Instant.now();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        persistFailure(id, code, occurredAt);
                    }
                }
            });
        } else {
            persistFailure(id, code, occurredAt);
        }
    }

    private void persistFailure(String id, String code, Instant occurredAt) {
        try {
            failures.record(id, code, occurredAt);
        } catch (RuntimeException exception) {
            // Preserve the original business error. Never log peer bodies or credentials.
            log.warn("action=REPOST_FAILURE_RECORD orderId={} error={} outcome=not_saved", id, code);
        }
    }

    private Order findForUpdate(String id) {
        return orders.getForUpdate(id)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
    }
}
