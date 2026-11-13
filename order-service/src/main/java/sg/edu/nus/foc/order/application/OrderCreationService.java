package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.RepostPlan;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
public class OrderCreationService {
    private final OrderRepository orders;
    private final CommandReceiptRepository receipts;
    private final OrderCheckpointRepository checkpoints;
    private final UserServicePort users;
    private final SupplierServicePort suppliers;
    private final CreditServicePort credits;
    private final OrderAuditLogger audit;

    @Transactional
    public Order create(
            String commandId,
            String requesterId,
            String description,
            String pickup,
            String delivery,
            long amount,
            int duration,
            Instant expiresAt,
            RepostPlan repostPlan,
            String authorization) {
        return createInternal(commandId, null, requesterId, description, pickup, delivery, amount,
                duration, expiresAt, repostPlan, authorization, false);
    }

    @Transactional
    public Order createConfirmed(String commandId, String candidateId, String requesterId,
            String description, String pickup, String delivery, long amount, int duration,
            Instant expiresAt, RepostPlan plan, String authorization) {
        return createInternal(commandId, candidateId, requesterId, description, pickup, delivery,
                amount, duration, expiresAt, plan, authorization, true);
    }

    private Order createInternal(String commandId, String candidateId, String requesterId,
            String description, String pickup, String delivery, long amount, int duration,
            Instant expiresAt, RepostPlan repostPlan, String authorization, boolean confirmed) {
        String authenticatedRequester = users.verifyRequester(requesterId, authorization);
        String fingerprint = CommandReceipt.fingerprint(description, pickup, delivery, amount, duration, expiresAt,
                repostPlan == null ? null : repostPlan.isEnabled(), repostPlan == null ? null : repostPlan.getDueAt(),
                repostPlan == null ? null : repostPlan.getCreditAmount(), repostPlan == null ? null : repostPlan.getDeliveryDurationMinutes(),
                repostPlan == null ? null : repostPlan.getExpiresAt());
        Optional<CommandReceipt> previous = receipts.findExisting(
                "CREATE",
                commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(candidateId == null ? previous.get().getOrderId() : candidateId, authenticatedRequester, fingerprint);
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        Order order = Order.openWithId(
                candidateId == null ? java.util.UUID.randomUUID().toString() : candidateId,
                authenticatedRequester,
                description,
                pickup,
                delivery,
                amount,
                duration,
                Instant.now(),
                expiresAt,
                repostPlan);

        if (!confirmed) {
            suppliers.validatePair(pickup, delivery, authorization);
            credits.reserve(order.getId(), authenticatedRequester, amount, authorization);
        }
        audit.dependency("credit-service", "reserve", order.getId(), "accepted");

        Order saved = orders.save(order);
        OrderCheckpoint checkpoint = new OrderCheckpoint(
                saved.getId(),
                saved.getStatus(),
                saved.getCreatedAt(),
                authenticatedRequester,
                null);
        checkpoints.save(checkpoint);
        receipts.save(new CommandReceipt("CREATE", commandId, saved.getId(), Instant.now()).bind(authenticatedRequester, fingerprint));
        audit.action("CREATE", saved.getId(), authenticatedRequester, commandId, "accepted");
        return saved;
    }
}
