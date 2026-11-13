package sg.edu.nus.foc.order.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "order_completion_holds")
@Getter
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class OrderCompletionHold {

    @Id
    @Column(name = "report_id", length = 128)
    private String reportId;

    @Column(name = "order_id", nullable = false, length = 36)
    private String orderId;

    @Column(name = "requester_id", nullable = false, length = 128)
    private String requesterId;

    @Column(name = "placed_at", nullable = false)
    private Instant placedAt;
    private Instant releasedAt;
    @Column(length = 128)
    private String releasedBy;

    public OrderCompletionHold(String reportId, String orderId, String requesterId, Instant placedAt) {
        this(reportId, orderId, requesterId, placedAt, null, null);
    }

    public void release(String adminId, Instant now) {
        if (releasedAt != null) return;
        if (adminId == null || adminId.isBlank() || adminId.length() > 128) {
            throw new OrderProblem("VALIDATION_ERROR", "Administrator identity is required.");
        }
        releasedAt = java.util.Objects.requireNonNull(now);
        releasedBy = adminId;
    }

    public void requireBinding(String orderId, String requesterId) {
        if (!this.orderId.equals(orderId) || !this.requesterId.equals(requesterId)) {
            throw OrderProblem.conflict("This report is already bound to a different order or requester.");
        }
    }
}
