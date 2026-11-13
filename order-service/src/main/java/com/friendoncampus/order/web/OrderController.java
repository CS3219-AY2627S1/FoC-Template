package com.friendoncampus.order.web;

import java.net.URI;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.friendoncampus.order.domain.OrderErrorCode;
import com.friendoncampus.order.service.CreateOrderResult;
import com.friendoncampus.order.service.IdempotencyKeyException;
import com.friendoncampus.order.service.OrderService;
import com.friendoncampus.order.web.dto.CreateOrderRequest;
import com.friendoncampus.order.web.dto.OrderResponse;
import com.friendoncampus.order.web.dto.OrderTransitionResponse;
import com.friendoncampus.order.web.dto.UpdateOrderRequest;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/orders")
@Tag(name = "Orders", description = "Create and manage campus errand orders")
@SecurityRequirement(name = "bearer-jwt")
public class OrderController {

    static final String IDEMPOTENCY_KEY = "Idempotency-Key";
    private static final Pattern IDEMPOTENCY_KEY_PATTERN = Pattern.compile("[A-Za-z0-9_-]{1,64}");

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @Operation(
            operationId = "createOrder",
            summary = "Create an order",
            description = "Validates and stores a new order in PENDING_CREDIT. The requester identity "
                    + "is taken from the verified User Service JWT 'sub' claim; it is never read from "
                    + "the request body or a header. Requires a REQUESTER session role. Send an "
                    + "Idempotency-Key to make the request safe to retry: repeating it with the same "
                    + "key and body returns the errand already created (200) without reserving credits "
                    + "again.")
    @ApiResponses({
            @ApiResponse(
                    responseCode = "201",
                    description = "Order created in PENDING_CREDIT",
                    headers = @Header(
                            name = "Location",
                            description = "Relative URL of the created order",
                            schema = @Schema(type = "string", example = "/api/orders/9fd58f13-c8d5-4320-b757-7893d69a4ae0")),
                    content = @Content(schema = @Schema(implementation = OrderResponse.class))),
            @ApiResponse(
                    responseCode = "200",
                    description = "A repeat of an earlier request with the same Idempotency-Key and body; "
                            + "the errand it created is returned and nothing is written",
                    content = @Content(schema = @Schema(implementation = OrderResponse.class))),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing or invalid order fields, or INVALID_IDEMPOTENCY_KEY",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "401",
                    description = "Missing, expired, or otherwise invalid bearer token",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "403",
                    description = "Valid token, but the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "IDEMPOTENCY_KEY_REUSED: the key was already used for a different errand",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(
            @AuthenticationPrincipal Jwt jwt,
            @Parameter(description = "Client-chosen key for this create request, 1-64 characters from "
                    + "A-Z, a-z, 0-9, '-' and '_' (a UUID works). Reuse it only to retry the same request.",
                    example = "6f1c2b7e-3d4a-4c1f-9b8e-2a7d5e0c9f13")
            @RequestHeader(name = IDEMPOTENCY_KEY, required = false) String idempotencyKey,
            @Valid @RequestBody CreateOrderRequest request) {
        // The decoder guarantees a present, UUID-shaped 'sub'; identity comes only from the token.
        UUID requesterId = UUID.fromString(jwt.getSubject());
        CreateOrderResult result = orderService.createOrder(request.toCommand(requesterId),
                validIdempotencyKey(idempotencyKey));
        OrderResponse response = OrderResponse.from(result.order());
        URI location = URI.create("/api/orders/" + response.id());
        if (result.replayed()) {
            return ResponseEntity.ok().location(location).body(response);
        }
        return ResponseEntity.created(location).body(response);
    }

    private static String validIdempotencyKey(String key) {
        if (key != null && !IDEMPOTENCY_KEY_PATTERN.matcher(key).matches()) {
            throw new IdempotencyKeyException(OrderErrorCode.INVALID_IDEMPOTENCY_KEY,
                    "Idempotency-Key must be 1-64 characters from A-Z, a-z, 0-9, '-' and '_'");
        }
        return key;
    }

    @Operation(
            operationId = "getOrder",
            summary = "Get an order",
            description = "OPEN orders are visible to any signed-in user. In any other state only the "
                    + "requester or the assigned courier can see the order; anyone else gets 404.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The order"),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/{id}")
    public OrderResponse getOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.getOrder(id, callerId(jwt)));
    }

    @Operation(
            operationId = "getOrderHistory",
            summary = "Get an order's transition history",
            description = "Every state change in the order it happened. Visible to the requester and "
                    + "the assigned courier only.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The transitions, oldest first"),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller is not a participant",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @GetMapping("/{id}/history")
    public List<OrderTransitionResponse> getOrderHistory(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return orderService.getHistory(id, callerId(jwt)).stream()
                .map(OrderTransitionResponse::from)
                .toList();
    }

    @Operation(
            operationId = "updateOrder",
            summary = "Edit an open order",
            description = "The requester replaces all editable fields of an OPEN order (every field is "
                    + "required, with the create rules) and sends the order version they last read. "
                    + "Changing only details applies at once. Changing creditReward keeps the current "
                    + "reward, sets pendingCreditReward and asks Credit to adjust the reservation; the new "
                    + "reward applies only after Credit confirms, and meanwhile the order cannot be "
                    + "accepted or edited. Resending the values the order already holds returns it "
                    + "unchanged. Requires a REQUESTER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The edited order"),
            @ApiResponse(
                    responseCode = "400",
                    description = "Missing or invalid fields",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ORDER_REQUESTER, or the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "INVALID_STATE_TRANSITION (not OPEN), ORDER_EXPIRED, REWARD_ADJUSTMENT_PENDING, "
                            + "or VERSION_CONFLICT (with currentVersion)",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PatchMapping("/{id}")
    public OrderResponse updateOrder(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateOrderRequest request) {
        return OrderResponse.from(orderService.edit(id, callerId(jwt), request.version(), request.toDetails()));
    }

    @Operation(
            operationId = "cancelOrder",
            summary = "Cancel an order",
            description = "The requester cancels an OPEN order (full credit release) or an ACCEPTED order "
                    + "(the courier is compensated). Not allowed once the order is picked up. Repeating "
                    + "a cancel returns the cancelled order without any further effect. Requires a "
                    + "REQUESTER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The cancelled order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "Not the order's requester, or the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "CANCELLATION_NOT_ALLOWED after pickup, or INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/cancel")
    public OrderResponse cancelOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.cancel(id, callerId(jwt)));
    }

    @Operation(
            operationId = "acceptOrder",
            summary = "Accept an order",
            description = "A courier accepts an OPEN order before its pickup deadline and becomes its "
                    + "assigned courier. If several couriers accept at once, only the first one processed "
                    + "succeeds. Requesters cannot accept their own orders. Repeating an acceptance you "
                    + "already made returns the order unchanged. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The accepted order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "SELF_ACCEPTANCE_FORBIDDEN, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "ORDER_ALREADY_ACCEPTED (another courier won), ORDER_EXPIRED, or "
                            + "INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/accept")
    public OrderResponse acceptOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.accept(id, callerId(jwt)));
    }

    @Operation(
            operationId = "withdrawFromOrder",
            summary = "Withdraw from an accepted order",
            description = "The assigned courier withdraws before pickup. Before the pickup deadline the "
                    + "order reopens for other couriers; at or after the deadline it expires. Not allowed "
                    + "once picked up. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The reopened or expired order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ASSIGNED_COURIER, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "CANCELLATION_NOT_ALLOWED after pickup, or INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/withdraw")
    public OrderResponse withdrawFromOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.withdraw(id, callerId(jwt)));
    }

    @Operation(
            operationId = "pickUpOrder",
            summary = "Mark an order as picked up",
            description = "The assigned courier confirms they have collected the item. Allowed only when "
                    + "ACCEPTED; a late pickup after the deadline is allowed. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The picked-up order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ASSIGNED_COURIER, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/pickup")
    public OrderResponse pickUpOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.pickUp(id, callerId(jwt)));
    }

    @Operation(
            operationId = "deliverOrder",
            summary = "Mark an order as delivered",
            description = "The assigned courier confirms they have handed the item over. Allowed only when "
                    + "PICKED_UP. Requires a COURIER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The delivered order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ASSIGNED_COURIER, or the session role is not COURIER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/deliver")
    public OrderResponse deliverOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.deliver(id, callerId(jwt)));
    }

    @Operation(
            operationId = "completeOrder",
            summary = "Confirm receipt of an order",
            description = "The requester confirms they received the item, which settles the full reward to "
                    + "the courier. Allowed only when DELIVERED. Repeating a confirmation returns the "
                    + "completed order with no second settlement. Requires a REQUESTER session role.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "The completed order"),
            @ApiResponse(
                    responseCode = "403",
                    description = "NOT_ORDER_REQUESTER, or the session role is not REQUESTER",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "404",
                    description = "No such order, or the caller may not see it",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE)),
            @ApiResponse(
                    responseCode = "409",
                    description = "INVALID_STATE_TRANSITION",
                    content = @Content(mediaType = MediaType.APPLICATION_PROBLEM_JSON_VALUE))
    })
    @PostMapping("/{id}/complete")
    public OrderResponse completeOrder(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
        return OrderResponse.from(orderService.complete(id, callerId(jwt)));
    }

    private static UUID callerId(Jwt jwt) {
        // The decoder guarantees a present, UUID-shaped 'sub'; identity comes only from the token.
        return UUID.fromString(jwt.getSubject());
    }
}
