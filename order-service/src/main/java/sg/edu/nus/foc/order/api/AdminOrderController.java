package sg.edu.nus.foc.order.api;


import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import sg.edu.nus.foc.order.application.AdminApplyPenaltyService;
import sg.edu.nus.foc.order.api.dto.request.ApplyPenaltyRequest;
import java.security.Principal;
import java.util.List;
import java.time.Instant;
import org.springframework.format.annotation.DateTimeFormat;
import sg.edu.nus.foc.common.penalty.PenaltySystemPolicy;
import sg.edu.nus.foc.order.api.dto.response.PenaltyPolicyResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import sg.edu.nus.foc.order.api.dto.request.AdminCancelOrderRequest;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.AdminOrderCancellationService;
import sg.edu.nus.foc.order.application.OrderCompletionHoldService;
import org.springframework.web.bind.annotation.PutMapping;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.security.annotation.RequireAdminRole;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class AdminOrderController {

    private final OrderQueryService queries;
    private final OrderMapper orderMapper;
    private final AdminOrderCancellationService cancellations;
    private final OrderCompletionHoldService holds;
    private final AdminApplyPenaltyService penalties;
    @org.springframework.beans.factory.annotation.Value("${order.reports.resolution.enabled:false}")
    private boolean coordinatedReportResolution;

    @Operation(summary = "List orders for administrators by status, exact ID and creation date range",
            description = "Filters are applied in SQL before pagination. actionEligibleOnly includes OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED, including held Orders. These states permit an admin cancellation; assigned active Orders may also receive a penalty. Existing command guards still apply. createdFrom is inclusive; createdBefore is exclusive. Omitted filters are unrestricted.")
    @ApiResponse(responseCode = "200", description = "Filtered page and total count")
    @ApiResponse(responseCode = "400", description = "Invalid status, date, range or Order ID")
    @SecurityRequirement(name = "bearerAuth")
    @RequireAdminRole
    @GetMapping
    public OrderPageResponse listOrders(
            @RequestParam(required = false) OrderStatus status,
            @PageableDefault(size = 20) Pageable pageable,
            @Parameter(description = "Optional exact Order ID") @RequestParam(required = false) String orderId,
            @Parameter(description = "Inclusive creation timestamp") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            @RequestParam(required = false) Instant createdFrom,
            @Parameter(description = "Exclusive creation timestamp") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME)
            @RequestParam(required = false) Instant createdBefore,
            @Parameter(description = "Only lifecycle states permitting at least one admin action; combines with other filters before count/paging. Defaults false.")
            @RequestParam(defaultValue = "false") boolean actionEligibleOnly) {
        if (actionEligibleOnly) {
            return orderMapper.toResponse(queries.allOrders(status, orderId, createdFrom, createdBefore, true,
                    pageable.getPageNumber(), pageable.getPageSize()));
        }
        if (orderId != null || createdFrom != null || createdBefore != null) {
            return orderMapper.toResponse(queries.allOrders(status, orderId, createdFrom, createdBefore,
                    pageable.getPageNumber(), pageable.getPageSize()));
        }
        return orderMapper.toResponse(queries.allOrders(
                status,
                pageable.getPageNumber(),
                pageable.getPageSize()));
    }

    @GetMapping("/admin/penalty-policies")
    @RequireAdminRole
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "List current penalty addition policies for administrator resolution",
            description = "Read-only shared policy lookup. Report cases only; excludes automatic cancellation, overdue and reward policies. Amounts cannot be supplied by clients.")
    @ApiResponse(responseCode = "200", description = "Policy enum names and addition amounts")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Administrator role required")
    @ApiResponse(responseCode = "503", description = "Role lookup unavailable")
    public List<PenaltyPolicyResponse> penaltyPolicies() {
        return orderMapper.toPenaltyPolicies(PenaltySystemPolicy.getCourierPenaltyCases());
    }

    @PostMapping("/admin/{orderId}/cancel")
    @RequireAdminRole
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Cancel an active order as administrator, optionally applying the highest courier penalty",
            description = "May resolve a held order. Participant IDs must match the stored order. Null/empty selections explicitly cancel without a penalty, even when one was stored. A selected penalty competes with the stored policy; the highest applies. Cancellation does not consider overdue. SUCCESSFUL_DELIVERY is not an addition. State and event intents commit atomically; delivery is asynchronous. Exact retries by the same administrator are idempotent.")
    @ApiResponse(responseCode = "200", description = "Cancellation and required event intents committed, or an exact replay")
    @ApiResponse(responseCode = "400", description = "Invalid request, reward case or penalty without an assigned courier")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Administrator role required")
    @ApiResponse(responseCode = "404", description = "Order not found")
    @ApiResponse(responseCode = "409", description = "Terminal order, participant mismatch, unresolved command, conflicting replay or row contention")
    @ApiResponse(responseCode = "503", description = "Role lookup unavailable")
    public OrderResponse cancel(
            @Parameter(description = "Order business ID") @PathVariable String orderId,
            @Valid @RequestBody AdminCancelOrderRequest request,
            Principal principal) {
        String adminId = principal == null ? "local-admin" : principal.getName();
        return orderMapper.toResponse(cancellations.cancel(orderId, request.getRequesterId(), request.getCourierId(),
                request.getAppliedPenalties(), adminId, request.getResolutionReason()));
    }

    @PutMapping("/admin/{orderId}/completion-holds/{reportId}/release")
    @RequireAdminRole
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Release one resolved report's completion hold", description = "Legacy direct administrative release. Disabled while coordinated Report resolution is enabled; use its resolve endpoint. Existing unresolved resolution journals always block bypass, even with transport disabled. Other report holds remain; no status/funding event is emitted.")
    @ApiResponse(responseCode = "200", description = "Hold released, or already released")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Administrator required")
    @ApiResponse(responseCode = "404", description = "Order or hold not found")
    @ApiResponse(responseCode = "409", description = "Wrong report binding, pending command or row contention")
    public OrderResponse releaseHold(@PathVariable String orderId, @PathVariable String reportId, Principal principal) {
        if (coordinatedReportResolution) throw sg.edu.nus.foc.order.domain.OrderProblem.conflict("Use the coordinated Report resolution endpoint to release this hold.");
        return orderMapper.toResponse(holds.release(orderId, reportId, principal == null ? "local-admin" : principal.getName()));
    }

    @PostMapping("/admin/{orderId}/apply-penalty")
    @RequireAdminRole
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Store the highest report penalty for the assigned active courier", description = "Includes held orders. Does not publish an event, change status or call User Service to change a score. Equal/lower penalties do not replace the existing policy or audit. Requester/automatic completion chooses the highest of stored penalty and overdue. Penalties cannot be cleared; exact same-command retries are idempotent.")
    @ApiResponse(responseCode = "200", description = "Highest policy stored, unchanged lower/equal selection, or exact replay")
    @ApiResponse(responseCode = "400", description = "Invalid report policy, reason, command or version")
    @ApiResponse(responseCode = "401", description = "Authentication required")
    @ApiResponse(responseCode = "403", description = "Administrator required")
    @ApiResponse(responseCode = "404", description = "Order not found")
    @ApiResponse(responseCode = "409", description = "Terminal/unassigned order, stale version, wrong courier, pending command, contention or conflicting replay")
    @ApiResponse(responseCode = "503", description = "Role lookup unavailable")
    public OrderResponse applyPenalty(@PathVariable String orderId, @Valid @RequestBody ApplyPenaltyRequest request, Principal principal) {
        return orderMapper.toResponse(penalties.apply(request.getCommandId(), orderId, request.getCourierId(), request.getExpectedVersion(),
                request.getPolicy(), request.getReason(), principal == null ? "local-admin" : principal.getName()));
    }
}
