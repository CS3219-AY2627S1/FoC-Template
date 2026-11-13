package sg.edu.nus.foc.order.api.dto.response;
import java.time.Instant;
import java.util.List;
import lombok.*;
import sg.edu.nus.foc.order.api.dto.request.ReportEvidence;
@Getter @Setter @NoArgsConstructor
public class ReportDemoResponse {
    private String id;
    private ReportDemoOrderResponse order;
    private String requesterId;
    private String courierId;
    private String status;
    private String violationCategory;
    private String requesterExplanation;
    private List<ReportEvidence> requesterAttachments;
    private String courierExplanation;
    private List<ReportEvidence> courierAttachments;
    private Instant createdAt;
    private Instant courierResponseSubmittedAt;
    private Instant resolvedAt;
    private String resolvedBy;
    private String resolutionNote;
}
