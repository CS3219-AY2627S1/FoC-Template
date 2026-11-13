package sg.edu.nus.foc.order.api;

import java.util.Map;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import sg.edu.nus.foc.order.api.dto.request.CreateOrderRequest;
import sg.edu.nus.foc.order.api.dto.request.OrderActorRequest;
import sg.edu.nus.foc.order.api.dto.request.ManualRepostRequest;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.security.annotation.*;

@RestController
@RequestMapping("/api/orders/commands")
@SecurityRequirement(name = "bearerAuth")
@RequiredArgsConstructor
public class OrderCommandController {
    private final OrderCommandService commands;

    @GetMapping("/capabilities") @RequireOrderRole
    @Operation(summary = "Discover whether durable Credit command recovery is enabled")
    @ApiResponse(responseCode = "200", description = "Deployment command capability; HTTP peers use the real Credit command protocol")
    public Map<String, Object> capabilities() {
        return Map.of("enabled", commands.enabled(), "protocol",
                commands.compensationSelected() ? "credit-compensation-v1-fixture" : "credit-command-v1");
    }

    @PostMapping("/create") @RequireRequesterRole
    @Operation(summary = "Submit a durable order creation command")
    @ApiResponse(responseCode = "200", description = "Terminal command result")
    @ApiResponse(responseCode = "202", description = "Durable pending command")
    public ResponseEntity<CommandView> create(@Valid @RequestBody CreateOrderRequest r,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        var fields = new CommandRequest.Creation(r.getItemDescription(), r.getPickupSupplierId(),
                r.getDeliverySupplierId(), r.getOfferedCredits(), r.getDeliveryTimeLimitMinutes(),
                r.getExpiresAt(), r.isAutomaticRepost(), r.getRepostDueAt(), r.getRepostCreditAmount(),
                r.getRepostDeliveryDurationMinutes(), r.getRepostExpiresAt());
        return response(commands.submit(r.getCommandId(), new CommandRequest("CREATE", r.getRequesterId(), null, 0, fields), authorization));
    }

    @PostMapping("/{id}/accept") @RequireCourierRole
    @Operation(summary = "Submit a durable courier acceptance command")
    @ApiResponse(responseCode = "403", description = "Courier role/identity mismatch or courier is suspended; no new command is registered")
    @ApiResponse(responseCode = "200", description = "Terminal command result")
    @ApiResponse(responseCode = "202", description = "Durable pending command")
    public ResponseEntity<CommandView> accept(@PathVariable String id, @Valid @RequestBody OrderActorRequest r,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return response(commands.submit(r.getCommandId(), new CommandRequest("ACCEPT", r.getActorId(), id, r.getExpectedVersion(), null), authorization));
    }

    @PostMapping("/{id}/abort") @RequireCourierRole
    @Operation(summary = "Submit a durable accepted-only abort command")
    @ApiResponse(responseCode = "200", description = "Terminal command result")
    @ApiResponse(responseCode = "202", description = "Durable pending command")
    public ResponseEntity<CommandView> abort(@PathVariable String id, @Valid @RequestBody OrderActorRequest r,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return response(commands.submit(r.getCommandId(), new CommandRequest("ABORT", r.getActorId(), id, r.getExpectedVersion(), null), authorization));
    }

    @PostMapping("/{id}/repost") @RequireRequesterRole
    @Operation(summary = "Submit a durable manual repost with a stable new candidate ID")
    @ApiResponse(responseCode = "200", description = "Terminal command result; success contains the new OPEN successor")
    @ApiResponse(responseCode = "202", description = "Saved pending manual repost; original remains EXPIRED")
    public ResponseEntity<CommandView> repost(@PathVariable String id, @Valid @RequestBody ManualRepostRequest r,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return response(commands.submit(r.getCommandId(), repostInput(id, r), authorization));
    }

    static CommandRequest repostInput(String id, ManualRepostRequest r) {
        CommandRequest.Creation fields = new CommandRequest.Creation(r.getItemDescription(), null, null,
                r.getOfferedCredits(), r.getDeliveryTimeLimitMinutes(), r.getExpiresAt(), false, null, 0, 0, null);
        return new CommandRequest("REPOST", r.getActorId(), id, r.getExpectedVersion(), fields);
    }

    @GetMapping("/{key}") @RequireOrderRole
    @Operation(summary = "Read an owned command result without executing it")
    @ApiResponse(responseCode = "200", description = "Owned saved command status")
    public CommandView status(@PathVariable String key, @RequestParam String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return commands.status(key, userId, authorization);
    }

    @PostMapping("/{key}/resume") @RequireOrderRole
    @Operation(summary = "Resume an owned saved command using fresh authorization")
    @ApiResponse(responseCode = "200", description = "Terminal command result")
    @ApiResponse(responseCode = "202", description = "Pending; an active worker is not duplicated")
    public ResponseEntity<CommandView> resume(@PathVariable String key, @RequestParam String userId,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        return response(commands.resume(key, userId, authorization));
    }

    @GetMapping @RequireOrderRole
    @Operation(summary = "Discover pending commands owned by the signed-in user")
    @ApiResponse(responseCode = "200", description = "Owned pending commands")
    public Map<String, Object> pending(@RequestParam String userId,
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size,
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (page < 1 || size < 1 || size > 100) throw new sg.edu.nus.foc.order.domain.OrderProblem("VALIDATION_ERROR", "Invalid command page or size.");
        var items = commands.pending(userId, authorization, page, size);
        long count = commands.pendingCount(userId);
        return Map.of("items", items, "page", page, "size", size, "totalItems", count, "totalPages", (count + size - 1) / size);
    }

    private static ResponseEntity<CommandView> response(CommandView view) {
        return ResponseEntity.status("PENDING".equals(view.status()) ? 202 : 200).body(view);
    }
}
