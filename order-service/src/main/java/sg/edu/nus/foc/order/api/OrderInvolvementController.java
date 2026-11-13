package sg.edu.nus.foc.order.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import sg.edu.nus.foc.order.api.dto.response.SupplierActiveOrderInvolvementResponse;
import sg.edu.nus.foc.order.api.dto.response.UserActiveOrderInvolvementResponse;
import sg.edu.nus.foc.order.api.mapper.OrderInvolvementMapper;
import sg.edu.nus.foc.order.application.OrderInvolvementService;
import sg.edu.nus.foc.order.security.annotation.RequireOrderRole;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
@RequireOrderRole
@SecurityRequirement(name = "bearerAuth")
@Tag(name = "Active Order involvement", description = "Shared-role snapshot queries; not deletion authorization or a deletion lock")
public class OrderInvolvementController {

    private final OrderInvolvementService involvement;
    private final OrderInvolvementMapper mapper;

    @GetMapping("/users/{userId}/active-involvement")
    @Operation(summary = "Check whether a user is requester or current courier of an active order",
            description = "Requester, Courier and Admin can query. Includes OPEN, ACCEPTED, IN_PROGRESS, PICKED_UP and DELIVERED, including held orders. Historical attempts and terminal orders do not count. No matching order returns false. This snapshot does not prevent a check/delete race.")
    @ApiResponse(responseCode = "200", description = "User ID and active-order involvement boolean")
    @ApiResponse(responseCode = "400", description = "Invalid ID")
    @ApiResponse(responseCode = "401", description = "Authentication required in production")
    @ApiResponse(responseCode = "403", description = "Caller has none of the three recognized roles")
    @ApiResponse(responseCode = "503", description = "Caller role verification unavailable")
    public UserActiveOrderInvolvementResponse user(
            @Parameter(description = "User ID, not an Order ID") @PathVariable String userId) {
        return mapper.toUserResponse(involvement.user(userId));
    }

    @GetMapping("/suppliers/{supplierId}/active-involvement")
    @Operation(summary = "Check whether a supplier is pickup or delivery location of an active order",
            description = "Requester, Courier and Admin can query. Includes the five active lifecycle statuses and held orders, independent of expiry timestamp. No matching order returns false; supplier existence is owned by Supplier Service. This is not permission to deactivate.")
    @ApiResponse(responseCode = "200", description = "Supplier ID and active-order involvement boolean")
    @ApiResponse(responseCode = "400", description = "Invalid ID")
    @ApiResponse(responseCode = "401", description = "Authentication required in production")
    @ApiResponse(responseCode = "403", description = "Caller has none of the three recognized roles")
    @ApiResponse(responseCode = "503", description = "Caller role verification unavailable")
    public SupplierActiveOrderInvolvementResponse supplier(
            @Parameter(description = "Supplier ID for either location") @PathVariable String supplierId) {
        return mapper.toSupplierResponse(involvement.supplier(supplierId));
    }
}
