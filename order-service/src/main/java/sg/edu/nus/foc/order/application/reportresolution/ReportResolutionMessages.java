package sg.edu.nus.foc.order.application.reportresolution;

/** Proposed Report-owned operation journal contract; no bearer tokens or full Order snapshots. */
public final class ReportResolutionMessages {
    private ReportResolutionMessages() { }
    public record Command(String commandId, String reportId, String orderId, String requesterId,
            String courierId, String adminId, long generation, String reply) { }
    public record Resolution(String commandId, String reportId, String orderId, String requesterId,
            String courierId, String adminId, long generation, String outcome, String code) { }
    public record Compensation(String eventId, String commandId, String reportId, String orderId,
            String requesterId, String courierId, String adminId, long generation) { }
    public record Result(String eventId, String compensationId, String commandId, String reportId,
            String orderId, String requesterId, String courierId, String adminId, long generation,
            String outcome, String code) { }
}
