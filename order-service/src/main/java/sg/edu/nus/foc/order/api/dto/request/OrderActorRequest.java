package sg.edu.nus.foc.order.api.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class OrderActorRequest {
    @NotBlank
    @jakarta.validation.constraints.Size(max = 128, message = "Command ID must be at most 128 characters.")
    private String commandId;

    @NotBlank
    private String actorId;

    @Min(0)
    private long expectedVersion;
}
