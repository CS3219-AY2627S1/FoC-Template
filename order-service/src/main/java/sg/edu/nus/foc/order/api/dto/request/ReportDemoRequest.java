package sg.edu.nus.foc.order.api.dto.request;
import java.util.List;
import lombok.*;
@Getter @Setter @NoArgsConstructor
public class ReportDemoRequest {
    private String userId;
    private String orderId;
    private String violationCategory;
    private String explanation;
    private List<ReportEvidence> attachments;
}
