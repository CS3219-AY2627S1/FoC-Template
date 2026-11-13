package sg.edu.nus.foc.order.domain.repository;

import java.util.List;
import sg.edu.nus.foc.order.domain.OrderCheckpoint;

public interface OrderCheckpointRepository {
    List<OrderCheckpoint> findByOrderId(String orderId);

    OrderCheckpoint save(OrderCheckpoint checkpoint);
}
