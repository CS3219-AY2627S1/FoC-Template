package com.cs3219.foc.order.repository;

import com.cs3219.foc.order.model.entity.DisputeStatus;
import com.cs3219.foc.order.model.entity.OrderDispute;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

public interface OrderDisputeRepository extends JpaRepository<OrderDispute, UUID> {
    Optional<OrderDispute> findByOrderId(UUID orderId);

    @Query("select d.orderId from OrderDispute d where d.id = :id")
    Optional<UUID> findOrderIdById(@Param("id") UUID id);

    boolean existsByOrderIdAndStatusNot(UUID orderId, DisputeStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from OrderDispute d where d.orderId = :orderId")
    Optional<OrderDispute> findForUpdateByOrderId(@Param("orderId") UUID orderId);
}
