package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
public class OrderAssignmentService {
    private final OrderRepository orders;
    private final OrderCheckpointRepository checkpoints;
    private final CommandReceiptRepository receipts;
    private final UserServicePort users;
    private final CreditServicePort credits;
    private final OrderAuditLogger audit;

    @Transactional
    public Order accept(
            String commandId,
            String id,
            String courier,
            long version,
            String authorization) {
        return acceptInternal(commandId, id, courier, version, authorization, false);
    }

    @Transactional
    public Order acceptConfirmed(String commandId, String id, String courier, long version, String authorization) {
        return acceptInternal(commandId, id, courier, version, authorization, true);
    }

    private Order acceptInternal(String commandId, String id, String courier, long version,
                                 String authorization, boolean confirmed) {
        String authenticatedCourier = users.verifyCourier(courier, authorization);
        Optional<CommandReceipt> previous = receipts.findExisting(
                "ACCEPT",
                commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(id, authenticatedCourier, CommandReceipt.fingerprint("ACCEPT", id, authenticatedCourier, version));
            return orders.get(previous.get().getOrderId()).orElseThrow();
        }

        users.requireCourierAcceptance(authenticatedCourier, authorization);
        Order order = findForUpdate(id);
        Instant acceptedAt = Instant.now();
        order.validateAcceptance(authenticatedCourier, version, acceptedAt);
        if (!confirmed) credits.assignCourier(
                order.getId(),
                authenticatedCourier,
                authorization);
        Instant persistedAcceptanceAt = Instant.now();
        order.validateAcceptance(authenticatedCourier, version, persistedAcceptanceAt);
        order.accept(authenticatedCourier, version, persistedAcceptanceAt);

        checkpoints.save(new OrderCheckpoint(
                id,
                order.getStatus(),
                persistedAcceptanceAt,
                authenticatedCourier,
                null));

        Order saved = orders.save(order);
        receipts.save(new CommandReceipt("ACCEPT", commandId, saved.getId(), Instant.now())
                .bind(authenticatedCourier, CommandReceipt.fingerprint("ACCEPT", id, authenticatedCourier, version)));
        audit.action("ACCEPT", saved.getId(), authenticatedCourier, commandId, "accepted");
        return saved;
    }

    private Order findForUpdate(String id) {
        return orders.getForUpdate(id)
                .orElseThrow(() -> OrderProblem.notFound("Order not found."));
    }
}
