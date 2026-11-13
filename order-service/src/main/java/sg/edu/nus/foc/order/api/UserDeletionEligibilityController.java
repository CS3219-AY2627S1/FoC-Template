package sg.edu.nus.foc.order.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.order.application.OrderInvolvementService;

/** Private service-network snapshot, not an atomic user-deletion lock. */
@RestController
@RequiredArgsConstructor
@ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
public class UserDeletionEligibilityController {
    public static final String PATH = "/api/orders/internal/users/{userId}/can-delete";
    private final OrderInvolvementService involvement;
    private final sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;

    @PostMapping("/api/orders/internal/users/{userId}/deletion-preparations/{operationId}")
    @Operation(summary = "Prepare durable user deletion and block future Order work",
            description = "Private network only. Reuse the same operation ID after a lost reply. A successful barrier never expires. Active orders or unresolved commands permanently deny that particular operation.")
    @ApiResponse(responseCode = "200", description = "JSON true: durable deletion barrier granted")
    @ApiResponse(responseCode = "409", description = "ACTIVE_ORDER_INVOLVEMENT: durable denial; do not delete the identity")
    @ApiResponse(responseCode = "400", description = "Invalid user or operation ID")
    @ApiResponse(responseCode = "503", description = "Preparation cannot be confirmed; retain pending deletion")
    public boolean prepare(@Parameter(description = "Target User UID") @PathVariable String userId,
            @Parameter(description = "Persisted deletion operation ID") @PathVariable String operationId) {
        if (!deletionGuard.prepare(userId, operationId)) {
            throw new sg.edu.nus.foc.order.domain.OrderProblem("ACTIVE_ORDER_INVOLVEMENT",
                    "Active orders or unresolved requests prevent account deletion.");
        }
        return true;
    }

    @GetMapping(PATH)
    @Operation(summary = "Check whether User Service may soft-delete a user",
            description = "Internal network only; no Firebase JWT. False for current requester/courier involvement in any status other than COMPLETED, CANCELLED or EXPIRED. Includes held orders, excludes historical courier attempts. A snapshot, not a deletion lock; User Service must coordinate new work versus deletion.")
    @ApiResponse(responseCode = "200", description = "JSON boolean: true permits deletion, false blocks it")
    @ApiResponse(responseCode = "400", description = "Invalid user ID")
    public boolean canDelete(@Parameter(description = "User Service UID") @PathVariable String userId) {
        return involvement.canDeleteUser(userId);
    }
}
