/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Order-owned admin resolution entry point; review pending. */
package sg.edu.nus.foc.reporting.resolution;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.*;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import sg.edu.nus.foc.reporting.report.*;
import sg.edu.nus.foc.reporting.error.*;
import tools.jackson.databind.JsonNode;

@RestController
@ConditionalOnProperty(name="REPORT_RESOLUTION_ENABLED", havingValue="true")
public class AdminReportResolutionController {
    private final ReportRepository reports;
    private final RestClient orders;
    private final ReportResolutionStore store;
    @org.springframework.beans.factory.annotation.Autowired
    public AdminReportResolutionController(ReportRepository reports, ReportingProperties properties, ReportResolutionStore store) {
        this.reports=reports; this.store=store;
        var http = new SimpleClientHttpRequestFactory();
        http.setConnectTimeout(properties.orderService().timeout()); http.setReadTimeout(properties.orderService().timeout());
        orders=RestClient.builder().baseUrl(properties.orderService().baseUrl()).requestFactory(http).build();
    }
    AdminReportResolutionController(ReportRepository reports, ReportResolutionStore store, RestClient orders) {
        this.reports=reports; this.store=store; this.orders=orders;
    }
    public record Request(@NotBlank @Size(max=128) String commandId, @NotBlank @Size(max=2000) String reply) { }
    @PostMapping("/api/reports/{reportId}/resolve")
    @PreAuthorize("@callerRoles.isAdmin(authentication)")
    @Operation(summary="Request Order-coordinated report resolution with a private admin reply")
    @ApiResponse(responseCode="200", description="Report resolved and Order hold durably released")
    @ApiResponse(responseCode="202", description="Resolution recovery pending; poll Order with the same command ID")
    @ApiResponse(responseCode="409", description="Command conflict or final rejection")
    @ApiResponse(responseCode="503", description="Order unavailable; retry the same command ID and reply")
    public ResponseEntity<?> resolve(@PathVariable String reportId, @Valid @RequestBody Request request,
            @AuthenticationPrincipal Jwt jwt) {
        Report report=reports.findById(reportId).orElseThrow(() -> new NotFoundException("Report not found."));
        if (report.orderId()==null || report.category()==ReportCategory.CREDITS) {
            store.resolve(new ResolutionMessages.Command(request.commandId(), report.id(), report.orderId(), report.reporterId(),
                    report.courierId(), jwt.getSubject(), 1, request.reply().strip()));
            return ResponseEntity.ok(sg.edu.nus.foc.reporting.api.ReportResponse.from(reports.findById(reportId).orElseThrow(), null, true));
        }
        try {
            ResponseEntity<JsonNode> response = orders.post().uri("/api/orders/admin/{order}/reports/{report}/resolve", report.orderId(), reportId)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwt.getTokenValue())
                    .body(Map.of("commandId", request.commandId(), "reply", request.reply().strip()))
                    .retrieve().toEntity(JsonNode.class);
            // This response has a newly serialized body. Never forward another hop's
            // Content-Length, Transfer-Encoding, Connection or security headers.
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().value()==409) throw new ConflictException("Resolution was rejected or compensated. Check the Order command before trying a new request.");
            if (e.getStatusCode().value()==403) throw new ForbiddenException("Order Service rejected administrator access.");
            throw new DependencyUnavailableException("Order resolution is unavailable; retry the same command ID.", e);
        } catch (RestClientException e) { throw new DependencyUnavailableException("Order resolution is unavailable; retry the same command ID.", e); }
    }
}
