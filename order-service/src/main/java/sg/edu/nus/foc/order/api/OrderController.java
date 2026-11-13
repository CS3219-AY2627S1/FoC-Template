package sg.edu.nus.foc.order.api;

import java.time.Instant;
import java.util.Map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import sg.edu.nus.foc.order.application.recovery.CommandRequest;
import sg.edu.nus.foc.order.application.recovery.CommandView;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;
import sg.edu.nus.foc.order.security.OrderReadAccessPolicy;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import sg.edu.nus.foc.order.api.dto.request.CreateOrderRequest;
import sg.edu.nus.foc.order.api.dto.request.ManualRepostRequest;
import sg.edu.nus.foc.order.api.dto.request.OrderActorRequest;
import sg.edu.nus.foc.order.api.dto.request.RepostConfigurationRequest;
import sg.edu.nus.foc.order.api.dto.response.OrderPageResponse;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.api.dto.response.RepostDraftResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderAssignmentService;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.OrderStatus;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.domain.RepostPlan;
import sg.edu.nus.foc.order.security.annotation.RequireCourierRole;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;
import sg.edu.nus.foc.order.security.annotation.RequireRequesterRole;

@RestController
@RequestMapping("/api/orders")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class OrderController {

    private final OrderCreationService creation;
    private final OrderAssignmentService assignment;
    private final OrderTransitionService transitions;
    private final OrderQueryService queries;
    private final OrderRepostService reposts;
    private final LifecycleProcessingService lifecycle;
    private final UserServicePort users;
    private final OrderMapper orderMapper;

    @Value("${order.lifecycle-token}")
    @Setter
    private String lifecycleToken;

    @Autowired @Setter private OrderCommandService commands;
    @Autowired @Setter private OrderReadAccessPolicy readAccess;
    @Value("${FOC_ENVIRONMENT:local}") @Setter private String lifecycleEnvironment = "local";
    @Value("${order.lifecycle.external-enabled:false}") @Setter private boolean lifecycleExternalEnabled;

    @Operation(summary = "Create an order and reserve credits")
    @PostMapping
    @RequireRequesterRole
    @ApiResponse(responseCode = "202", description = "Saved pending command; keep the same command ID")
    public ResponseEntity<?> create(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        CommandRequest.Creation fields = new CommandRequest.Creation(request.getItemDescription(),
                request.getPickupSupplierId(), request.getDeliverySupplierId(), request.getOfferedCredits(),
                request.getDeliveryTimeLimitMinutes(), request.getExpiresAt(), request.isAutomaticRepost(),
                request.getRepostDueAt(), request.getRepostCreditAmount(), request.getRepostDeliveryDurationMinutes(),
                request.getRepostExpiresAt());
        return legacyResponse(commands.submit(request.getCommandId(),
                new CommandRequest("CREATE", request.getRequesterId(), null, 0, fields), authorization));
    }

    @Operation(summary = "Get an order by ID")
    @GetMapping("/{id}")
    @RequireOrderRole
    public OrderResponse get(@PathVariable String id) {
        Order order = queries.get(id);
        readAccess.check(order);
        return orderMapper.toResponse(order);
    }

    @Operation(summary = "List available open orders")
    @GetMapping("/available")
    @RequireOrderRole
    public OrderPageResponse available(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size) {
        return orderMapper.toResponse(queries.available(page - 1, size));
    }

    @Operation(summary = "List personal orders, optionally filtered by status")
    @ApiResponse(responseCode = "200", description = "Paginated orders owned by the verified requester or courier")
    @ApiResponse(responseCode = "400", description = "Invalid mode or status")
    @ApiResponse(responseCode = "401", description = "Authentication required in production")
    @ApiResponse(responseCode = "403", description = "Caller identity or role does not match")
    @GetMapping("/mine")
    @RequireOrderRole
    public OrderPageResponse mine(
            @RequestParam String mode,
            @RequestParam String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @Parameter(description = "Optional Order status; omit to include all statuses")
            @RequestParam(required = false) OrderStatus status) {
        OrderPage orders = switch (mode.toLowerCase()) {
            case "requester" -> {
                String authenticatedUser = users.verifyRequester(userId, authorization);
                yield queries.requestedBy(authenticatedUser, status, page - 1, size);
            }
            case "courier" -> {
                String authenticatedUser = users.verifyCourier(userId, authorization);
                yield queries.courierFor(authenticatedUser, status, page - 1, size);
            }
            default -> throw new OrderProblem(
                    "VALIDATION_ERROR",
                    "Mode must be requester or courier.");
        };
        return orderMapper.toResponse(orders);
    }

    @Operation(summary = "Accept an available order as a courier")
    @ApiResponse(responseCode = "403", description = "Courier role/identity mismatch or courier is suspended; no new acceptance is registered")
    @PostMapping("/{id}/accept")
    @RequireCourierRole
    @ApiResponse(responseCode = "202", description = "Saved pending command; keep the same command ID")
    public ResponseEntity<?> accept(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return legacyResponse(commands.submit(request.getCommandId(),
                new CommandRequest("ACCEPT", request.getActorId(), id, request.getExpectedVersion(), null), authorization));
    }

    @Operation(summary = "Start an accepted order")
    @ApiResponse(responseCode = "200", description = "Assigned courier starts delivery; courier suspension does not block existing work")
    @PostMapping("/{id}/start")
    @RequireCourierRole
    public OrderResponse start(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return orderMapper.toResponse(transitions.start(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                authorization));
    }

    @Operation(summary = "Mark an order as picked up")
    @ApiResponse(responseCode = "200", description = "Assigned courier picks up the order; courier suspension does not block existing work")
    @PostMapping("/{id}/pickup")
    @RequireCourierRole
    public OrderResponse pickup(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return orderMapper.toResponse(transitions.pickup(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                authorization));
    }

    @Operation(summary = "Mark an order as delivered")
    @ApiResponse(responseCode = "200", description = "Assigned courier delivers the order; courier suspension does not block existing work")
    @PostMapping("/{id}/deliver")
    @RequireCourierRole
    public OrderResponse deliver(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return orderMapper.toResponse(transitions.deliver(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                authorization));
    }

    @Operation(summary = "Confirm completion and publish the completion event")
    @ApiResponse(responseCode = "200", description = "Completion committed, or successful request replayed")
    @ApiResponse(responseCode = "409", description = "Completion hold, stale version or invalid lifecycle state")
    @PostMapping("/{id}/complete")
    @RequireRequesterRole
    public OrderResponse complete(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return orderMapper.toResponse(transitions.complete(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                authorization));
    }

    @Operation(summary = "Cancel an open order and publish the cancellation event")
    @ApiResponse(responseCode = "200", description = "Cancellation committed, or successful request replayed")
    @ApiResponse(responseCode = "409", description = "Report hold freezes funding, stale version or invalid lifecycle state")
    @PostMapping("/{id}/cancel")
    @RequireRequesterRole
    public OrderResponse cancel(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return orderMapper.toResponse(transitions.cancel(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                authorization));
    }

    @Operation(summary = "Abort an accepted errand; retain courier history, reopen or expire, and queue outcome events")
    @PostMapping("/{id}/cancel-accepted")
    @RequireCourierRole
    @ApiResponse(responseCode = "202", description = "Saved pending command; keep the same command ID")
    public ResponseEntity<?> cancelAccepted(
            @PathVariable String id,
            @Valid @RequestBody OrderActorRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return legacyResponse(commands.submit(request.getCommandId(),
                new CommandRequest("ABORT", request.getActorId(), id, request.getExpectedVersion(), null), authorization));
    }

    @Operation(summary = "Reject legacy post-creation repost configuration")
    @PostMapping("/{id}/repost/configure")
    @RequireRequesterRole
    public OrderResponse configure(
            @PathVariable String id,
            @Valid @RequestBody RepostConfigurationRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        // Legacy configuration always conflicts; do not invent a new expiry.
        RepostPlan repostPlan = null;
        return orderMapper.toResponse(reposts.configure(
                request.getCommandId(),
                id,
                request.getActorId(),
                request.getExpectedVersion(),
                repostPlan,
                authorization));
    }

    @Operation(summary = "Get a manual repost draft for an expired order")
    @GetMapping("/{id}/repost-draft")
    @RequireRequesterRole
    public RepostDraftResponse draft(
            @PathVariable String id,
            @RequestParam String actorId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        String authenticatedActor = users.verifyRequester(actorId, authorization);
        Order order = queries.get(id);
        if (!order.getRequesterId().equals(authenticatedActor)) {
            throw OrderProblem.forbidden("Only the requester may view the draft.");
        }
        if (order.getStatus() != OrderStatus.EXPIRED || order.getRepostedOrderId() != null) {
            throw OrderProblem.conflict("Order is not eligible for a repost draft.");
        }
        return new RepostDraftResponse(
                order.getId(),
                order.getItemDescription(),
                order.getPickupSupplierId(),
                order.getDeliverySupplierId(),
                order.getOfferedCredits(),
                order.getDeliveryTimeLimitMinutes(),
                order.getExpiresAt());
    }

    @Operation(summary = "Create a requester-reviewed repost")
    @PostMapping("/{id}/repost")
    @RequireRequesterRole
    @ApiResponse(responseCode = "202", description = "Saved pending repost; retain the same command ID")
    public ResponseEntity<?> repost(
            @PathVariable String id,
            @Valid @RequestBody ManualRepostRequest request,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return legacyResponse(commands.submit(request.getCommandId(),
                OrderCommandController.repostInput(id, request), authorization));
    }

    @Operation(summary = "Create due automatic reposts using the lifecycle token")
    @PostMapping("/internal/lifecycle/repost")
    public Map<String, Integer> automaticRepost(
            @RequestHeader("X-Lifecycle-Token") String token) {
        checkToken(token);
        return Map.of("reposted", lifecycle.repostDue(Instant.now(), null));
    }

    private void checkToken(String token) {
        if (!lifecycleExternalEnabled || !"local".equals(lifecycleEnvironment)) {
            throw OrderProblem.forbidden("External lifecycle triggers are disabled.");
        }
        if (token == null || !token.equals(lifecycleToken)) {
            throw OrderProblem.forbidden("Invalid lifecycle token.");
        }
    }

    private ResponseEntity<?> legacyResponse(CommandView view) {
        if ("PENDING".equals(view.status())) return ResponseEntity.accepted().body(view);
        if ("SUCCESS".equals(view.outcome())) return ResponseEntity.ok(view.result());
        throw new OrderProblem(view.reason(), view.message());
    }
}
