package sg.edu.nus.foc.order.application.recovery;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.*;
import sg.edu.nus.foc.order.domain.*;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;

/** Commit intent -> claim -> remote effect -> atomic local finalize/result. */
@Service
@RequiredArgsConstructor
public class OrderCommandService {
    private final OrderCommandStore store;
    private final OrderRepository orders;
    private final CommandReceiptRepository receipts;
    private final OrderCreationService creation;
    private final OrderAssignmentService assignment;
    private final OrderTransitionService transitions;
    private final OrderRepostService reposts;
    private final UserServicePort users;
    private final SupplierServicePort suppliers;
    private final ObjectProvider<CreditCommandGateway> gateway;
    private final PlatformTransactionManager transactions;
    private final OrderMapper mapper;
    private final OrderAuditLogger audit;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;

    @Value("${order.peers.mode:mock}") private String mode;
    @Value("${order.commands.enabled:true}") private boolean flag;
    @Value("${order.commands.lease-seconds:120}") private int leaseSeconds;
    @Value("${order.commands.retry-seconds:15}") private int retrySeconds;
    @Value("${order.commands.batch-size:20}") private int batchSize;

    @Value("${order.commands.recovery-policy:retry}") private String recoveryPolicy = "retry";
    @Value("${order.commands.resolution-seconds:120}") private int resolutionSeconds = 120;
    @Value("${order.commands.compensation.enabled:false}") private boolean compensationTransportEnabled;
    @org.springframework.beans.factory.annotation.Autowired private OrderCompensationWorkflow compensationWorkflow;
    @org.springframework.beans.factory.annotation.Autowired private OrderCompensationJournal compensationJournal;
    @org.springframework.beans.factory.annotation.Autowired private ObjectProvider<BackgroundRepostChecks> backgroundChecks;

    public boolean compensationSelected() { return "compensate".equals(recoveryPolicy); }
    public boolean enabled() {
        // ADR-055: actual transport is an explicit, startup-validated opt-in.
        return flag && ("retry".equals(recoveryPolicy) || compensationSelected())
                && (!compensationSelected() || "mock".equals(mode) || compensationTransportEnabled)
                && ("mock".equals(mode) || "http".equals(mode)) && gateway.getIfAvailable() != null;
    }
    private void requireEnabled() {
        if (!enabled()) throw new OrderProblem("SERVICE_UNAVAILABLE", "Command recovery is disabled or its Credit gateway is unavailable.");
    }

    public CommandView submit(String key, CommandRequest input, String authorization) {
        requireEnabled();
        authorize(input, authorization);
        // Replaying an existing command is not a new assignment. Recovery below
        // checks suspension before any further ACCEPT effect.
        if ("ACCEPT".equals(input.kind()) && store.find(key).isEmpty()) {
            users.requireCourierAcceptance(input.actorId(), authorization);
        }
        try (CommandScope ignored = new CommandScope(key)) {
            tx().executeWithoutResult(status -> {
                Order original = null;
                if (!"CREATE".equals(input.kind())) {
                    original = orders.getForUpdate(input.orderId()).orElseThrow(() -> OrderProblem.notFound("Order not found."));
                }
                // Legacy receipts have no immutable input/actor evidence. Never guess a migration binding.
                String operation = switch (input.kind()) {
                    case "ABORT" -> "CANCEL_ACCEPTED";
                    case "REPOST" -> "MANUAL_REPOST";
                    default -> input.kind();
                };
                if (receipts.findExisting(operation, key).isPresent() && store.find(key).isEmpty()) {
                    throw OrderProblem.conflict("This key belongs to a legacy operation. Use its original workflow.");
                }
                var frozen = "REPOST".equals(input.kind()) ? frozenRepost(key, input, original) : input;
                if (store.find(key).isPresent()) {
                    // A rolling policy cutover cannot reinterpret an immutable K.
                    store.register(key, frozen, store.recoveryPolicy(key), Math.max(1, resolutionSeconds));
                } else if (compensationSelected()) store.register(key, frozen, "COMPENSATE", Math.max(1, resolutionSeconds));
                else store.register(key, frozen);
            });
        }
        return execute(key, authorization, true);
    }

    /** Called only by the server lifecycle coordinator, never from browser input. */
    public CommandView submitAutomatic(String originalId, Instant now) {
        requireEnabled();
        if (!"mock".equals(mode) && !compensationTransportEnabled) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Automatic repost requires compensation transport.");
        }
        Order snapshot = orders.get(originalId).orElseThrow(() -> OrderProblem.notFound("Order not found."));
        var previous = store.latestAutomatic(originalId, snapshot.getRequesterId()).orElse(null);
        if (previous != null && !store.automaticRetrySafe(previous.key())) {
            // A pending/uncertain attempt belongs to recovery, never another forward worker.
            // Successful exact retries likewise return their immutable result.
            return view(previous);
        }
        if (!backgroundChecks.getObject().fundingReady(originalId, snapshot.getRequesterId())) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Waiting for the original reservation refund.");
        }
        String root = "AUTO_REPOST:" + originalId;
        // Keep old keys/results/fences intact. Only a safe terminal attempt permits a new Credit identity.
        String key = previous == null ? root : root + ":retry:" + UUID.randomUUID();
        try (CommandScope ignored = new CommandScope(key)) {
            tx().executeWithoutResult(tx -> {
                Order original = orders.getForUpdate(originalId)
                        .orElseThrow(() -> OrderProblem.notFound("Order not found."));
                var current = store.latestAutomatic(originalId, original.getRequesterId()).orElse(null);
                if (current != null && (previous == null || !current.key().equals(previous.key())
                        || !store.automaticRetrySafe(current.key()))) {
                    throw OrderProblem.conflict("Another automatic repost attempt already owns this order.");
                }
                if (!original.eligibleForAutomaticRepost(now)) {
                    throw OrderProblem.conflict("Order is not eligible for automatic repost.");
                }
                RepostPlan plan = original.getRepostPlan();
                CommandRequest.Creation fields = new CommandRequest.Creation(original.getItemDescription(),
                        original.getPickupSupplierId(), original.getDeliverySupplierId(), plan.getCreditAmount(),
                        plan.getDeliveryDurationMinutes(), plan.getExpiresAt(), false, null, 0, 0, null);
                store.registerAutomatic(key, new CommandRequest("REPOST", original.getRequesterId(),
                        originalId, original.getVersion(), fields), Math.max(1, resolutionSeconds));
            });
        }
        // One forward effect per immutable attempt; another attempt waits for a terminal safe outcome.
        return executeCompensation(key, null, true);
    }

    private CommandRequest frozenRepost(String key, CommandRequest input, Order original) {
        if (!original.getRequesterId().equals(input.actorId())) {
            throw OrderProblem.forbidden("Only the requester may repost.");
        }
        CommandRequest.Creation fields = input.creation();
        if (fields == null) throw new OrderProblem("VALIDATION_ERROR", "Repost details are required.");
        OrderCommandStore.Entry saved = store.find(key).orElse(null);
        // Server-owned references are bound once. Same-key replay keeps the original fingerprint.
        CommandRequest.Creation prior = saved != null && "REPOST".equals(saved.kind()) ? saved.input().creation() : null;
        CommandRequest.Creation frozen = new CommandRequest.Creation(fields.description(),
                prior == null ? original.getPickupSupplierId() : prior.pickup(),
                prior == null ? original.getDeliverySupplierId() : prior.delivery(),
                fields.amount(), fields.duration(), fields.expiresAt(), false, null, 0, 0, null);
        return new CommandRequest("REPOST", input.actorId(), input.orderId(), input.expectedVersion(), frozen);
    }

    public CommandView status(String key, String actor, String authorization) {
        var saved = owned(key, actor, authorization);
        return view(saved);
    }

    public List<CommandView> pending(String actor, String authorization, int page, int size) {
        // USER identity must be verified before discovery. No arbitrary actor lookup.
        verifyReader(actor, authorization);
        return store.pendingFor(actor, page, size).stream().map(this::view).toList();
    }

    public long pendingCount(String actor) { return store.pendingCount(actor); }

    public CommandView resume(String key, String actor, String authorization) {
        requireEnabled(); owned(key, actor, authorization);
        return execute(key, authorization, true);
    }

    public void recoverDue() {
        if (!enabled()) return;
        if (compensationJournal != null && ("mock".equals(mode) || compensationTransportEnabled)) {
            for (String key : compensationJournal.due(Math.max(1, Math.min(batchSize, 100)))) {
                try { compensationJournal.recover(key); }
                catch (RuntimeException failure) { audit.action("COMMAND_COMPENSATION", null, null, key, "pending"); }
            }
        }
        for (String key : store.due(Math.max(1, Math.min(batchSize, 100)))) {
            try { execute(key, null, false); }
            catch (RuntimeException failure) { audit.action("COMMAND_RECOVERY", null, null, key, "pending"); }
        }
    }

    private OrderCommandStore.Entry owned(String key, String actor, String authorization) {
        var saved = store.get(key);
        if (!saved.actorId().equals(actor)) throw OrderProblem.forbidden("Only the command owner may access it.");
        verifyReader(actor, authorization);
        return saved;
    }

    private void verifyReader(String actor, String authorization) {
        // A past owned outcome is not a new courier task. Reuse already-validated
        // JWT identity/role facts without rechecking current courier eligibility.
        var authentication = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken caller) {
            boolean requester = caller.getAuthorities().stream()
                    .anyMatch(a -> "ROLE_REQUESTER".equals(a.getAuthority()));
            var role = requester ? sg.edu.nus.foc.order.security.Role.REQUESTER : sg.edu.nus.foc.order.security.Role.COURIER;
            sg.edu.nus.foc.order.security.VerifiedOrderCaller.identityFor(role, actor);
        } else if (!actor.equals(users.verifyRequester(actor, authorization))) {
            throw OrderProblem.forbidden("Command owner mismatch.");
        }
    }

    private void authorize(CommandRequest input, String authorization) {
        String verified = switch (input.kind()) {
            case "CREATE", "REPOST" -> users.verifyRequester(input.actorId(), authorization);
            case "ACCEPT", "ABORT" -> users.verifyCourier(input.actorId(), authorization);
            default -> throw new OrderProblem("VALIDATION_ERROR", "Unsupported command operation.");
        };
        if (!input.actorId().equals(verified)) throw OrderProblem.forbidden("Command owner mismatch.");
    }

    private CommandView execute(String key, String authorization, boolean userResume) {
        if ("COMPENSATE".equals(store.recoveryPolicy(key))) {
            // Persisted policy, not today's registration default, owns recovery.
            if (!"mock".equals(mode) && !compensationTransportEnabled) return view(store.get(key));
            return executeCompensation(key, authorization, userResume);
        }
        var candidate = store.claim(key, UUID.randomUUID().toString(), Math.max(1, leaseSeconds), userResume);
        if (candidate.isEmpty()) return view(store.get(key));
        var claim = candidate.get();
        var mutation = mutation(claim);
        try (CommandScope ignored = new CommandScope(key)) {
            if ("http".equals(mode) && (authorization == null || authorization.isBlank())) {
                throw new OrderProblem("UNAUTHENTICATED", "Fresh authorization is required to recover this request.");
            }
            authorize(claim.input(), authorization);
            if ("ACCEPT".equals(claim.kind())) users.requireCourierAcceptance(claim.actorId(), authorization);
            try {
                tx().executeWithoutResult(status -> {
                    store.assertOwned(claim);
                    validate(claim);
                });
                if (claim.kind().equals("CREATE") || claim.kind().equals("REPOST")) {
                    var fields = claim.input().creation();
                    suppliers.validatePair(fields.pickup(), fields.delivery(), authorization);
                }
            } catch (OrderProblem invalid) {
                if (isAuthorization(invalid)) throw invalid;
                if (isTemporary(invalid)) throw invalid;
                if (claim.possibleEffect()) {
                    if (!gateway.getObject().compensate(key, mutation, claim.generation(), authorization)) {
                        store.defer(claim, "RECONCILIATION_REQUIRED", "We are checking the earlier Credit outcome. Please wait.", retrySeconds);
                        return view(store.get(key));
                    }
                }
                // Preserve the trusted validation explanation (for example an active
                // report hold). Credit response codes still use the safe mapping below.
                reject(claim, invalid.getCode(), invalid.getMessage());
                return view(store.get(key));
            }
            // Persist the uncertainty barrier BEFORE invoking Credit, even if this process crashes next.
            tx().executeWithoutResult(status -> store.markPossibleEffect(claim));
            var remote = gateway.getObject().execute(key, mutation, claim.generation(), authorization);
            if (!remote.applied()) {
                // Only an authoritative saved no-effect result may be returned as a rejection.
                reject(claim, remote.code(), rejectionMessage(claim, remote.code()));
            } else {
                try {
                    tx().executeWithoutResult(status -> {
                        store.assertOwned(claim);
                        Order result = finalizeOrder(claim, authorization);
                        entityManager.flush(); // Include the committed JPA version in the saved replay result.
                        store.complete(claim, "SUCCESS", "SUCCEEDED", "Request completed.", mapper.toResponse(result));
                    });
                } catch (OrderProblem invalidAfterSuccess) {
                    if (isAuthorization(invalidAfterSuccess) || isTemporary(invalidAfterSuccess)) throw invalidAfterSuccess;
                    // Re-read/claim-fence before reversal: a stale worker must not compensate a new owner.
                    tx().executeWithoutResult(status -> store.assertOwned(claim));
                    if (gateway.getObject().compensate(key, mutation, claim.generation(), authorization)) {
                        reject(claim, "DEADLINE_OR_STATE_CHANGED", "REPOST".equals(claim.kind())
                                ? "Repost is no longer valid; its Credit change was reversed."
                                : "The request is no longer valid; its Credit change was reversed.");
                    } else {
                        store.defer(claim, "RECONCILIATION_REQUIRED", "We are checking the earlier Credit outcome. Please wait.", retrySeconds);
                    }
                }
            }
        } catch (RuntimeException failure) {
            if (failure instanceof CourierAcceptanceDenied denied) {
                rejectSuspendedAcceptance(claim, mutation, authorization, denied);
                return view(store.get(key));
            }
            boolean auth = failure instanceof OrderProblem p && isAuthorization(p);
            store.defer(claim, auth ? "AUTHORIZATION_REQUIRED" : "RETRY_SCHEDULED",
                    auth ? "Sign in or continue to authorize recovery of this request."
                         : "Outcome not confirmed. We will safely retry this request.", Math.max(1, retrySeconds));
            audit.action("COMMAND_RECOVERY", claim.orderId(), claim.actorId(), key, auth ? "authorization_required" : "pending");
        }
        return view(store.get(key));
    }

    private void rejectSuspendedAcceptance(OrderCommandStore.Entry claim, CreditCommandGateway.Mutation mutation,
            String authorization, CourierAcceptanceDenied denied) {
        tx().executeWithoutResult(status -> store.assertOwned(claim));
        // Claim can predate a persisted uncertainty barrier; re-read before rejecting.
        if (store.get(claim.key()).possibleEffect()) {
            boolean reversed;
            try {
                reversed = gateway.getObject().compensate(claim.key(), mutation, claim.generation(), authorization);
            } catch (RuntimeException uncertain) {
                reversed = false;
            }
            if (!reversed) {
                store.defer(claim, "RECONCILIATION_REQUIRED", "We are checking the earlier Credit outcome. Please wait.", Math.max(1, retrySeconds));
                return;
            }
        }
        reject(claim, denied.getCode(), denied.getMessage());
    }

    private CommandView executeCompensation(String key, String authorization, boolean userResume) {
        if (!"COMPENSATE".equals(store.recoveryPolicy(key))) return view(store.get(key));
        var candidate = store.claim(key, UUID.randomUUID().toString(), Math.max(1, leaseSeconds), userResume);
        if (candidate.isEmpty()) return view(store.get(key));
        var claim = candidate.get();
        try (CommandScope ignored = new CommandScope(key)) {
            compensationWorkflow.execute(claim, mutation(claim), authorization, () -> {
                boolean automatic = store.automaticExecution(key);
                if (!automatic) authorize(claim.input(), authorization);
                if ("ACCEPT".equals(claim.kind())) users.requireCourierAcceptance(claim.actorId(), authorization);
                tx().executeWithoutResult(tx -> { store.assertOwned(claim); validate(claim); });
                if ("CREATE".equals(claim.kind()) || "REPOST".equals(claim.kind())) {
                    var fields = claim.input().creation();
                    if (automatic) backgroundChecks.getObject().validate(claim.actorId(), fields.pickup(), fields.delivery());
                    else suppliers.validatePair(fields.pickup(), fields.delivery(), authorization);
                }
            }, () -> {
                Order result = finalizeOrder(claim, authorization);
                entityManager.flush();
                return mapper.toResponse(result);
            });
        }
        return view(store.get(key));
    }

    private void validate(OrderCommandStore.Entry claim) {
        var input = claim.input();
        switch (claim.kind()) {
            case "CREATE" -> {
                var f = input.creation();
                if (f == null) throw new OrderProblem("VALIDATION_ERROR", "Creation details are required.");
                Order.openWithId(claim.orderId(), input.actorId(), f.description(), f.pickup(), f.delivery(),
                        f.amount(), f.duration(), Instant.now(), f.expiresAt(), f.plan());
            }
            case "ACCEPT" -> locked(claim).validateAcceptance(input.actorId(), input.expectedVersion(), Instant.now());
            case "ABORT" -> locked(claim).validateAcceptedCancellation(input.actorId(), input.expectedVersion());
            case "REPOST" -> {
                Order original = locked(claim);
                original.requireVersion(input.expectedVersion());
                if (!original.getRequesterId().equals(input.actorId())) {
                    throw OrderProblem.forbidden("Only the requester may repost.");
                }
                CommandRequest.Creation fields = input.creation();
                if (store.automaticExecution(claim.key())) {
                    if (!original.eligibleForAutomaticRepost(Instant.now())) {
                        throw OrderProblem.conflict("Automatic repost is no longer eligible.");
                    }
                    original.createRepostWithId(claim.candidateOrderId(), fields.description(), fields.amount(),
                            fields.duration(), Instant.now(), fields.expiresAt());
                    return;
                }
                if (fields.expiresAt() != null && !fields.expiresAt().isAfter(Instant.now())) {
                    throw new OrderProblem("REPOST_EXPIRED", "Repost expiry has passed.");
                }
                original.createManualRepostWithId(claim.candidateOrderId(), fields.description(), fields.amount(),
                        fields.duration(), claim.createdAt(), Instant.now(), fields.expiresAt());
            }
            default -> throw new OrderProblem("VALIDATION_ERROR", "Unsupported command.");
        }
    }

    private Order locked(OrderCommandStore.Entry claim) {
        return orders.getForUpdate(claim.orderId()).orElseThrow(() -> OrderProblem.notFound("Order not found."));
    }

    private Order finalizeOrder(OrderCommandStore.Entry claim, String authorization) {
        var input = claim.input();
        return switch (claim.kind()) {
            case "CREATE" -> {
                var f = input.creation();
                yield creation.createConfirmed(claim.key(), claim.orderId(), input.actorId(), f.description(),
                        f.pickup(), f.delivery(), f.amount(), f.duration(), f.expiresAt(), f.plan(), authorization);
            }
            case "ACCEPT" -> assignment.acceptConfirmed(claim.key(), claim.orderId(), input.actorId(), input.expectedVersion(), authorization);
            case "ABORT" -> transitions.abortConfirmed(claim.key(), claim.orderId(), input.actorId(), input.expectedVersion(), authorization);
            case "REPOST" -> {
                if (store.automaticExecution(claim.key())) {
                    yield reposts.automaticConfirmed(claim.key(), claim.orderId(), claim.candidateOrderId(), input.expectedVersion());
                }
                CommandRequest.Creation fields = input.creation();
                yield reposts.manualConfirmed(claim.key(), claim.orderId(), claim.candidateOrderId(), input.actorId(),
                        input.expectedVersion(), fields.description(), fields.amount(), fields.duration(),
                        claim.createdAt(), fields.expiresAt());
            }
            default -> throw new IllegalStateException("Unsupported saved command.");
        };
    }

    private CreditCommandGateway.Mutation mutation(OrderCommandStore.Entry claim) {
        return new CreditCommandGateway.Mutation(store.automaticExecution(claim.key()) && "http".equals(mode) ? "AUTO_REPOST"
                : "REPOST".equals(claim.kind()) ? "CREATE" : claim.kind(),
                "REPOST".equals(claim.kind()) ? claim.candidateOrderId() : claim.orderId(), claim.actorId(),
                claim.input().creation() == null ? 0 : claim.input().creation().amount());
    }
    private void reject(OrderCommandStore.Entry claim, String code, String message) {
        tx().executeWithoutResult(status -> {
            store.assertOwned(claim);
            if ("REPOST".equals(claim.kind())) {
                Order original = locked(claim);
                if (original.getRequesterId().equals(claim.actorId()) && original.getStatus() == OrderStatus.EXPIRED
                        && original.getRepostedOrderId() == null) {
                    original.recordRepostFailure(code, message, Instant.now());
                    orders.save(original);
                }
            }
            store.complete(claim, "REJECTED", code, message, null);
        });
    }
    private CommandView view(OrderCommandStore.Entry entry) {
        return new CommandView(entry.key(), entry.kind(), entry.status(), entry.outcome(), entry.reason(), entry.message(),
                entry.orderId(), entry.attempts(), entry.nextRetry(), entry.result(), displayDetails(entry));
    }
    private CommandView.DisplayDetails displayDetails(OrderCommandStore.Entry entry) {
        if (!"PENDING".equals(entry.status())) return null;
        if ("CREATE".equals(entry.kind()) || "REPOST".equals(entry.kind())) {
            var creation = entry.input().creation();
            return creation == null ? null : new CommandView.DisplayDetails(creation.description(), creation.pickup(),
                    creation.delivery(), creation.amount(), creation.duration(), creation.expiresAt(), null, null);
        }
        if (!"ACCEPT".equals(entry.kind()) && !"ABORT".equals(entry.kind())) return null;
        // Projection for an authorized command owner; not general Order read access.
        return orders.get(entry.orderId()).map(order -> new CommandView.DisplayDetails(order.getItemDescription(),
                order.getPickupSupplierId(), order.getDeliverySupplierId(), order.getOfferedCredits(),
                order.getDeliveryTimeLimitMinutes(), order.getExpiresAt(), order.getStatus().name(), order.getVersion())).orElse(null);
    }
    private TransactionTemplate tx() { return new TransactionTemplate(transactions); }
    private static boolean isAuthorization(OrderProblem p) {
        return "UNAUTHENTICATED".equals(p.getCode()) || "FORBIDDEN".equals(p.getCode());
    }
    private static boolean isTemporary(OrderProblem p) {
        return "SERVICE_UNAVAILABLE".equals(p.getCode()) || "DEPENDENCY_UNAVAILABLE".equals(p.getCode());
    }
    private static String safeRejection(String code) {
        return "INSUFFICIENT_CREDITS".equals(code) ? "Request failed: insufficient available credits."
                : "Request could not be completed because its details or order state are no longer valid.";
    }
    private static String rejectionMessage(OrderCommandStore.Entry claim, String code) {
        if (!"REPOST".equals(claim.kind())) return safeRejection(code);
        return switch (code) {
            case "INSUFFICIENT_CREDITS" -> "Repost failed: insufficient available credits.";
            case "REPOST_EXPIRED" -> "Repost expired before it could be posted.";
            case "VALIDATION_ERROR" -> "Repost failed: check the request details.";
            case "NOT_FOUND", "ACCOUNT_NOT_FOUND" -> "Repost failed: a required account or location is unavailable.";
            default -> "Repost could not be completed because its details or order state are no longer valid.";
        };
    }
}
