/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.creation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.report.ReportSubmissionStore;
import sg.edu.nus.foc.reporting.report.ReportCreationCoordinator;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class CreationCompensationResultController {
    public static final String PUSH="/api/reports/internal/creation-compensation-results";
    public record Message(String data,Map<String,String> attributes){}
    public record Envelope(String subscription,Message message){}
    private final ReportCreationCoordinator coordinator;private final CreationSettings settings;private final JsonMapper json;
    public CreationCompensationResultController(ReportCreationCoordinator coordinator,CreationSettings settings,JsonMapper json){this.coordinator=coordinator;this.settings=settings;this.json=json;}
    @PostMapping(PUSH)
    @Operation(summary="Receive an authenticated Order creation-compensation result")
    @ApiResponse(responseCode="204",description="Result committed or duplicate acknowledged")
    @ApiResponse(responseCode="400",description="Invalid Pub/Sub envelope")
    @ApiResponse(responseCode="409",description="Result binding conflicts")
    public ResponseEntity<Void> receive(@RequestBody Envelope envelope){
        try{
            if(!settings.enabled()||envelope==null||!settings.resultSubscription().equals(envelope.subscription())||envelope.message()==null
                    ||envelope.message().attributes()==null||!"ReportCreationCompensationResult".equals(envelope.message().attributes().get("eventType"))
                    ||!"1".equals(envelope.message().attributes().get("eventVersion")))throw new IllegalArgumentException();
            byte[] bytes=Base64.getDecoder().decode(envelope.message().data());if(bytes.length>16384)throw new IllegalArgumentException();
            var result=json.readValue(new String(bytes,StandardCharsets.UTF_8),CreationCompensationMessages.Result.class);
            if(!result.eventId().equals(envelope.message().attributes().get("eventId")))throw new IllegalArgumentException();
            coordinator.acceptCompensation(result);return ResponseEntity.noContent().build();
        }catch(BadRequestException | ConflictException e){throw e;}catch(RuntimeException bad){throw new BadRequestException("Invalid creation compensation result envelope.",null);}
    }
}
