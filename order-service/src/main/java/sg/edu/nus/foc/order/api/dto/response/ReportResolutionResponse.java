package sg.edu.nus.foc.order.api.dto.response;

/** Status only while pending; immutable saved Order result after successful local commit. */
public record ReportResolutionResponse(String commandId, String orderId, String reportId,
        String status, String reason, OrderResponse order) { }
