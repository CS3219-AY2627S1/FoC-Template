package sg.edu.nus.foc.order.application;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import sg.edu.nus.foc.order.domain.ActiveOrderInvolvement;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class OrderInvolvementService {

    private final OrderRepository orders;

    public boolean canDeleteUser(String userId) {
        requireId(userId);
        return !orders.hasNonTerminalUserInvolvement(userId);
    }

    public ActiveOrderInvolvement user(String userId) {
        requireId(userId);
        return new ActiveOrderInvolvement(userId, orders.hasActiveUserInvolvement(userId));
    }

    public ActiveOrderInvolvement supplier(String supplierId) {
        requireId(supplierId);
        return new ActiveOrderInvolvement(supplierId, orders.hasActiveSupplierInvolvement(supplierId));
    }

    private void requireId(String id) {
        if (id == null || id.isBlank() || id.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "An ID of 1 through 128 characters is required.");
        }
    }
}
