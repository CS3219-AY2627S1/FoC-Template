package sg.edu.nus.foc.order.infrastructure;

import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.dao.DataIntegrityViolationException;

import sg.edu.nus.foc.order.domain.OrderCompletionHold;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.repository.OrderCompletionHoldRepository;

@Repository
@RequiredArgsConstructor
public class OrderCompletionHoldPersistenceAdapter implements OrderCompletionHoldRepository {

    private final JpaOrderCompletionHoldRepository repository;

    @Override
    public void release(OrderCompletionHold hold) {
        repository.saveAndFlush(hold);
    }

    @Override
    public boolean hasActiveForOrder(String orderId) {
        return repository.existsByOrderIdAndReleasedAtIsNull(orderId);
    }

    @Override
    public Optional<OrderCompletionHold> findByReportId(String reportId) {
        return repository.findById(reportId);
    }

    @Override
    public void save(OrderCompletionHold hold) {
        try {
            repository.insert(hold.getReportId(), hold.getOrderId(), hold.getRequesterId(), hold.getPlacedAt());
        } catch (DataIntegrityViolationException conflict) {
            throw OrderProblem.conflict("The report hold conflicts with an existing placement.");
        }
    }
}
