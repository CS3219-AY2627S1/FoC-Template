package sg.edu.nus.foc.order.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class CompletionHoldResponse {

    private String orderId;
    private String reportId;

    @JsonProperty("isCompletionHold")
    private boolean completionHold;

    private long version;
}
