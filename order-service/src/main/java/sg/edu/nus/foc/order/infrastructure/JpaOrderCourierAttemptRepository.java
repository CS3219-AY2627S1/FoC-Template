package sg.edu.nus.foc.order.infrastructure;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import sg.edu.nus.foc.order.domain.OrderCourierAttempt;

public interface JpaOrderCourierAttemptRepository extends JpaRepository<OrderCourierAttempt, UUID> {
}
