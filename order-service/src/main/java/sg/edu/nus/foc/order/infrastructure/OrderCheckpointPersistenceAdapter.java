package sg.edu.nus.foc.order.infrastructure;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;

@Repository
@RequiredArgsConstructor
public class OrderCheckpointPersistenceAdapter implements OrderCheckpointRepository {
    private final JpaOrderCheckpointRepository repository;

    @Override
    public List<OrderCheckpoint> findByOrderId(String orderId) {
        return repository.findByOrderIdOrderByOccurredAtAsc(orderId);
    }

    @Override
    public OrderCheckpoint save(OrderCheckpoint checkpoint) {
        return repository.save(checkpoint);
    }
}
