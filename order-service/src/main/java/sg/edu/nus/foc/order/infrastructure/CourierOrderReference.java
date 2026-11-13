package sg.edu.nus.foc.order.infrastructure;

import java.util.UUID;

public interface CourierOrderReference {
    String getOrderId();

    UUID getAttemptId();
}
