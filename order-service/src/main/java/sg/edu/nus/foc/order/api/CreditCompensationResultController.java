package sg.edu.nus.foc.order.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.order.application.recovery.CreditCompensationResult;
import sg.edu.nus.foc.order.application.recovery.OrderCompensationJournal;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

/** Broker authentication is enforced by its separate exact-path security chain. */
@RestController
@io.swagger.v3.oas.annotations.security.SecurityScheme(name = "pubSubPushAuth",
        type = io.swagger.v3.oas.annotations.enums.SecuritySchemeType.HTTP,
        scheme = "bearer", bearerFormat = "Google OIDC",
        description = "Dedicated verified Pub/Sub push identity, not a Firebase user token")
@ConditionalOnProperty(name = "order.commands.compensation.enabled", havingValue = "true")
public class CreditCompensationResultController {
    public static final String PATH = "/api/orders/internal/credit-compensations";
    public record Message(String data, Map<String, String> attributes) { }
    public record Envelope(String subscription, Message message) { }
    private final OrderCompensationJournal journal;
    private final JsonMapper json;
    private final CompensationTransportSettings settings;
    public CreditCompensationResultController(OrderCompensationJournal journal, JsonMapper json,
            CompensationTransportSettings settings) {
        this.journal = journal; this.json = json; this.settings = settings;
    }
    @PostMapping(PATH)
    @Operation(summary = "Receive an authenticated committed Credit compensation result",
            security = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "pubSubPushAuth"))
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "Result committed or identical replay acknowledged"),
        @ApiResponse(responseCode = "400", description = "Invalid envelope, subscription, type, version or result"),
        @ApiResponse(responseCode = "401", description = "Missing or invalid Google push identity"),
        @ApiResponse(responseCode = "409", description = "Result conflicts with saved command or event content"),
        @ApiResponse(responseCode = "503", description = "Persistence unavailable; delivery must retry")
    })
    public ResponseEntity<Void> receive(@RequestBody Envelope envelope) {
        CreditCompensationResult result;
        try {
            if (envelope == null || !settings.subscriptionPath().equals(envelope.subscription())
                    || envelope.message() == null || envelope.message().attributes() == null
                    || !"CreditCompensationResult".equals(envelope.message().attributes().get("eventType"))
                    || !"1".equals(envelope.message().attributes().get("eventVersion"))) {
                throw new IllegalArgumentException("Invalid result envelope.");
            }
            byte[] data = Base64.getDecoder().decode(envelope.message().data());
            result = json.readValue(new String(data, StandardCharsets.UTF_8), CreditCompensationResult.class);
        } catch (RuntimeException invalid) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid Credit compensation result envelope.");
        }
        journal.accept(result); // Includes transaction commit; failures must not ACK.
        return ResponseEntity.noContent().build();
    }
}
