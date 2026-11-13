package sg.edu.nus.foc.order.api.dto.request;
import lombok.*;
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class ReportEvidence {
    private String name;
    private String contentType;
    private String dataUrl;
}
