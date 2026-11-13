package sg.edu.nus.foc.order.api;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionJournal;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionMessages;
import sg.edu.nus.foc.order.config.ReportResolutionSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

@RestController
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class ReportCompensationResultController {
    public static final String PATH = "/api/orders/internal/report-resolution-compensations";
    public record Message(String data, Map<String, String> attributes) { }
    public record Envelope(String subscription, Message message) { }
    private final ReportResolutionJournal journal;
    private final JsonMapper json;
    private final ReportResolutionSettings settings;
    public ReportCompensationResultController(ReportResolutionJournal journal, JsonMapper json, ReportResolutionSettings settings) {
        this.journal = journal; this.json = json; this.settings = settings;
    }
    @PostMapping(PATH)
    @Operation(summary = "Receive a verified committed Report compensation result", security = @io.swagger.v3.oas.annotations.security.SecurityRequirement(name = "reportPubSubPushAuth"))
    @ApiResponse(responseCode = "204", description = "Result committed or identical duplicate acknowledged")
    @ApiResponse(responseCode = "400", description = "Invalid envelope, event type/version/ID or subscription")
    @ApiResponse(responseCode = "401", description = "Invalid Report Pub/Sub push identity")
    @ApiResponse(responseCode = "409", description = "Mismatched/contradictory operation or reused event ID")
    @ApiResponse(responseCode = "503", description = "Persistence unavailable; retry delivery")
    public ResponseEntity<Void> receive(@RequestBody Envelope envelope) {
        ReportResolutionMessages.Result result;
        try {
            if (envelope == null || !settings.transport().subscriptionPath().equals(envelope.subscription()) || envelope.message() == null
                    || envelope.message().attributes() == null || !"ReportResolutionCompensationResult".equals(envelope.message().attributes().get("eventType"))
                    || !"1".equals(envelope.message().attributes().get("eventVersion"))
                    || envelope.message().data() == null || envelope.message().data().length() > 21848) throw new IllegalArgumentException();
            byte[] body = Base64.getDecoder().decode(envelope.message().data());
            if (body.length > 16384) throw new IllegalArgumentException();
            result = json.readValue(new String(body, StandardCharsets.UTF_8), ReportResolutionMessages.Result.class);
            if (!result.eventId().equals(envelope.message().attributes().get("eventId"))) throw new IllegalArgumentException();
        } catch (RuntimeException invalid) {
            throw new OrderProblem("VALIDATION_ERROR", "Invalid Report compensation result envelope.");
        }
        journal.accept(result);
        return ResponseEntity.noContent().build();
    }
}
