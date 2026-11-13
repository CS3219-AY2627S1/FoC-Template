package sg.edu.nus.foc.order.infrastructure;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import sg.edu.nus.foc.order.domain.OrderCompletionHold;

public interface JpaOrderCompletionHoldRepository extends JpaRepository<OrderCompletionHold, String> {
    boolean existsByOrderIdAndReleasedAtIsNull(String orderId);

    @Modifying
    @Query(value = "insert into order_completion_holds (report_id,order_id,requester_id,placed_at) "
            + "values (:reportId,:orderId,:requesterId,:placedAt)", nativeQuery = true)
    void insert(
            @Param("reportId") String reportId,
            @Param("orderId") String orderId,
            @Param("requesterId") String requesterId,
            @Param("placedAt") Instant placedAt);
}
