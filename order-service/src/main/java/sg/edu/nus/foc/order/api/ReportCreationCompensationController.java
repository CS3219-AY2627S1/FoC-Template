/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.application.reportcreation.*;
import sg.edu.nus.foc.order.config.ReportCreationSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

@RestController
public class ReportCreationCompensationController {
    public static final String PATH="/api/orders/internal/report-creation-compensations";
    public record Message(String data,Map<String,String> attributes){}
    public record Envelope(String subscription,Message message){}
    private final ReportCreationLifecycle lifecycle;private final ReportCreationSettings settings;private final JsonMapper json;
    public ReportCreationCompensationController(ReportCreationLifecycle lifecycle,ReportCreationSettings settings,JsonMapper json){this.lifecycle=lifecycle;this.settings=settings;this.json=json;}
    @PostMapping(PATH)
    @Operation(summary="Conditionally release or fence a report-creation hold")
    @ApiResponse(responseCode="204",description="Compensation result and outbox committed")
    @ApiResponse(responseCode="400",description="Invalid Pub/Sub envelope")
    @ApiResponse(responseCode="409",description="Event binding conflict")
    public ResponseEntity<Void> receive(@RequestBody Envelope envelope){
        try{
            if(!settings.enabled()||envelope==null||!settings.requestSubscription().equals(envelope.subscription())||envelope.message()==null
                    ||envelope.message().attributes()==null||!"ReportCreationCompensationRequested".equals(envelope.message().attributes().get("eventType"))
                    ||!"1".equals(envelope.message().attributes().get("eventVersion")))throw new IllegalArgumentException();
            byte[] bytes=Base64.getDecoder().decode(envelope.message().data());if(bytes.length>16384)throw new IllegalArgumentException();
            var request=json.readValue(new String(bytes,StandardCharsets.UTF_8),ReportCreationMessages.Compensation.class);
            if(!request.eventId().equals(envelope.message().attributes().get("eventId")))throw new IllegalArgumentException();
            lifecycle.compensate(request);return ResponseEntity.noContent().build();
        }catch(OrderProblem e){throw e;}catch(RuntimeException e){throw new OrderProblem("VALIDATION_ERROR","Invalid report creation compensation envelope.");}
    }
}
