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
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class CreationRecoveryController {
    public static final String PATH="/api/reports/internal/creation-recovery";
    private final CreationCompensationDispatcher dispatcher;
    public CreationRecoveryController(CreationCompensationDispatcher dispatcher){this.dispatcher=dispatcher;}
    @PostMapping(PATH)
    @Operation(summary="Run one authenticated report-creation rollback recovery tick")
    @ApiResponse(responseCode="204",description="Expiry, fencing and compensation redrive attempted")
    public ResponseEntity<Void> recover(){dispatcher.recover();return ResponseEntity.noContent().build();}
}
