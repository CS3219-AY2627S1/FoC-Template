package sg.edu.nus.foc.credit.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.Map;

public record PubSubPushEnvelope(
        @NotNull @Valid Message message,
        @NotBlank String subscription) {

    public record Message(
            @NotBlank String data,
            String messageId,
            @NotNull Map<String, String> attributes) {
    }
}
