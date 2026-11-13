package sg.edu.nus.foc.order.api.dto.response;

import sg.edu.nus.foc.order.domain.OrderStatus;

public record ActiveReportHoldResponse(String id, String requesterId, String courierId,
        OrderStatus status, String reportId, boolean isCompletionHold) {}
