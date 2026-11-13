package sg.edu.nus.foc.order.application;

import java.time.Instant;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
public class AdminApplyPenaltyService {
    private static final String OPERATION = "APPLY_PENALTY";
    private final OrderRepository orders;
    private final CommandReceiptRepository receipts;
    private final OrderAuditLogger audit;

    @Transactional
    public Order apply(String commandId, String orderId, String courierId, long expectedVersion,
            PenaltySystemPolicy policy, String reason, String adminId) {
        if (commandId == null || commandId.isBlank() || commandId.length() > 128) throw new OrderProblem("VALIDATION_ERROR", "Command ID required.");
        String explanation = Order.normalizeAdminResolutionReason(reason);
        Order order = orders.getForLifecycleUpdate(orderId).orElseThrow(() -> OrderProblem.notFound("Order not found."));
        String binding = CommandReceipt.fingerprint(OPERATION, orderId, courierId, expectedVersion, policy, explanation, adminId);
        Optional<CommandReceipt> previous = receipts.findExisting(OPERATION, commandId);
        if (previous.isPresent()) {
            previous.get().requireBinding(orderId, adminId, binding);
            return order;
        }
        Instant now = Instant.now();
        order.applyPenalty(courierId, expectedVersion, policy, adminId, explanation, now);
        Order saved = orders.save(order);
        receipts.save(new CommandReceipt(OPERATION, commandId, orderId, now).bind(adminId, binding));
        audit.action(OPERATION, orderId, adminId, commandId, "Highest penalty stored; no score event until final outcome");
        return saved;
    }
}
