package com.cs3219.foc.order.model.dto;

import com.cs3219.foc.order.model.entity.DisputeDecision;
import com.cs3219.foc.order.model.entity.DisputeStatus;
import com.cs3219.foc.order.model.entity.OrderDispute;
import java.time.OffsetDateTime;
import java.util.UUID;

public record OrderDisputeDto(
        UUID id,
        UUID orderId,
        UUID reporterId,
        String complaint,
        UUID responderId,
        String response,
        OffsetDateTime respondedAt,
        DisputeStatus status,
        DisputeDecision decision,
        String explanation,
        UUID adminId,
        OffsetDateTime createdAt,
        OffsetDateTime decidedAt,
        OffsetDateTime resolvedAt,
        UUID settlementOperationId,
        String settlementOutcome) {
    public static OrderDisputeDto from(OrderDispute dispute) {
        return new OrderDisputeDto(
                dispute.getId(),
                dispute.getOrderId(),
                dispute.getReporterId(),
                dispute.getComplaint(),
                dispute.getResponderId(),
                dispute.getResponse(),
                dispute.getRespondedAt(),
                dispute.getStatus(),
                dispute.getDecision(),
                dispute.getExplanation(),
                dispute.getAdminId(),
                dispute.getCreatedAt(),
                dispute.getDecidedAt(),
                dispute.getResolvedAt(),
                dispute.getSettlementOperationId(),
                dispute.getSettlementOutcome());
    }
}
