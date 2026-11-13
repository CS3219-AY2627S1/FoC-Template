package sg.edu.nus.foc.order.api;

import java.security.Principal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.api.dto.response.ReportResolutionResponse;
import sg.edu.nus.foc.order.application.reportresolution.ReportResolutionService;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.security.annotation.RequireAdminRole;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/orders/admin")
@RequireAdminRole
@SecurityRequirement(name = "bearerAuth")
@ConditionalOnProperty(name = "order.reports.resolution.enabled", havingValue = "true")
public class AdminReportResolutionController {
    public record ResolveRequest(@NotBlank @Size(max = 128) String commandId, @NotBlank @Size(max = 2000) String reply) { }
    private final ReportResolutionService resolutions;
    @PostMapping("/{orderId}/reports/{reportId}/resolve")
    @Operation(summary = "Resolve a report synchronously before releasing its Order hold", description = "Opt-in proposed Report contract. IDs/participants come from the locked Order and hold. Stable command ID and admin reply required. A failed/uncertain remote or local outcome keeps the hold and durably requests compensation. Reuse the same command on timeout; do not retry with a new ID. No funding or penalty event is emitted by release itself.")
    @ApiResponse(responseCode = "200", description = "Report confirmed and hold release committed, or exact successful replay")
    @ApiResponse(responseCode = "202", description = "Durable resolution/compensation is pending; hold remains active")
    @ApiResponse(responseCode = "400", description = "Invalid reply or identifiers")
    @ApiResponse(responseCode = "401", description = "Authenticated admin bearer token required")
    @ApiResponse(responseCode = "403", description = "Admin role required")
    @ApiResponse(responseCode = "404", description = "Order or report hold missing")
    @ApiResponse(responseCode = "409", description = "Rejected/compensated resolution, changed binding, released hold, pending command or row contention")
    @ApiResponse(responseCode = "503", description = "Role/persistence unavailable; retry the same command ID")
    public ResponseEntity<ReportResolutionResponse> resolve(
            @Parameter(description = "Order bound to the existing report hold") @PathVariable String orderId,
            @Parameter(description = "Existing report-specific hold identity") @PathVariable String reportId,
            @Valid @RequestBody ResolveRequest request, Principal principal,
            @Parameter(hidden = true) @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (principal == null) throw new OrderProblem("UNAUTHENTICATED", "Administrator identity is required.");
        var result = resolutions.resolve(request.commandId(), orderId, reportId, principal.getName(), request.reply(), authorization);
        if ("REJECTED".equals(result.status()) || "COMPENSATED".equals(result.status()))
            throw OrderProblem.conflict("This report resolution did not complete. Check its saved status before starting another request.");
        return ResponseEntity.status("SUCCEEDED".equals(result.status()) ? 200 : 202).body(result);
    }
    @GetMapping("/report-resolutions/{commandId}")
    @Operation(summary = "Read the durable status of an administrator Report resolution")
    @ApiResponse(responseCode = "200", description = "Saved status and optional immutable successful Order result")
    @ApiResponse(responseCode = "400", description = "Invalid command ID")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Admin role required")
    @ApiResponse(responseCode = "404", description = "Resolution not found")
    public ReportResolutionResponse status(@Parameter(description = "Stable command ID submitted to resolve")
            @PathVariable String commandId) { return resolutions.status(commandId); }
}
