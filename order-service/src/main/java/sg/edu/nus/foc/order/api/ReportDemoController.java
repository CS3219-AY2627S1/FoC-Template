package sg.edu.nus.foc.order.api;

import java.util.List;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Conditional;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.config.ReportDemoCondition;
import sg.edu.nus.foc.order.api.dto.request.ReportDemoRequest;
import sg.edu.nus.foc.order.api.dto.response.*;
import sg.edu.nus.foc.order.application.adminmock.ReportDemoService;

/** Explicitly local-only sample surface; not the Report Service contract or production authorization. */
@RestController
@Conditional(ReportDemoCondition.class)
@RequestMapping("/api/orders/admin-mock/reports")
@RequiredArgsConstructor
@Tag(name = "Report demo", description = "Isolated sample reports; no real reports, funding or scores")
public class ReportDemoController {
    private final ReportDemoService reports;

    @GetMapping
    @Operation(summary = "Poll sample submitted, against-me or admin report pages")
    public ReportDemoPageResponse<ReportDemoResponse> list(@RequestParam String userId,
            @RequestParam(defaultValue = "submitted") String mode, @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "1") int page,
            @Parameter(description = "Exact related Order ID; optional") @RequestParam(required = false) String orderId,
            @Parameter(description = "Exact report status within the Open/Closed group; optional") @RequestParam(required = false) String reportStatus) {
        return reports.list(userId, mode, status, page, orderId, reportStatus);
    }
    @GetMapping("/eligible-orders")
    @Operation(summary = "List current sample requester's delivered orders eligible for a report")
    public List<ReportDemoOrderResponse> eligible(@RequestParam String userId) { return reports.eligible(userId); }

    @GetMapping("/{id}")
    @Operation(summary = "View one sample report, its evidence and related sample order")
    public ReportDemoResponse detail(@PathVariable String id, @RequestParam String userId,
            @RequestParam(defaultValue = "false") boolean admin) {
        return reports.detail(id, userId, admin);
    }
    @PostMapping
    @Operation(summary = "Submit one delivered-item sample report and hold its sample order")
    public ReportDemoResponse create(@RequestBody ReportDemoRequest request) { return reports.create(request); }

    @PutMapping("/{id}/courier-response")
    @Operation(summary = "Submit the sample courier's explanation while the report is unresolved")
    public ReportDemoResponse respond(@PathVariable String id, @RequestBody ReportDemoRequest request) {
        return reports.respond(id, request);
    }
    @PutMapping("/{id}/resolve")
    @Operation(summary = "Resolve an open sample report with a required admin reply and release its sample completion hold")
    public ReportDemoResponse resolve(@PathVariable String id, @RequestBody ReportDemoRequest request) {
        return reports.resolve(id, request.getUserId(), request.getExplanation());
    }
}
