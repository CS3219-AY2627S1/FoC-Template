package sg.edu.nus.foc.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "order_checkpoints")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderCheckpoint {
    @Id
    private String id = UUID.randomUUID().toString();
    @Column(name = "order_id", nullable = false)
    private String orderId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrderStatus status;
    @Column(nullable = false)
    private Instant occurredAt;
    private String actorId;
    private String supplierId;

    public OrderCheckpoint(String orderId, OrderStatus status, Instant occurredAt, String actorId, String supplierId) {
        this.orderId = orderId;
        this.status = status;
        this.occurredAt = occurredAt;
        this.actorId = actorId;
        this.supplierId = supplierId;
    }
}
