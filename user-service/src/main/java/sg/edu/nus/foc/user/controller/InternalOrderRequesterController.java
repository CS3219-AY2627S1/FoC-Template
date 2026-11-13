package sg.edu.nus.foc.user.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import sg.edu.nus.foc.user.logic.UserService;

/** Explicitly trusted private-network lookup; public user APIs still require JWTs. */
@RestController
@ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
public class InternalOrderRequesterController {
    private final UserService users;

    public InternalOrderRequesterController(UserService users) {
        this.users = users;
    }

    public record RequesterResult(String userId, boolean eligible) {}

    @GetMapping("/api/users/internal/order-requesters/{userId}")
    @Operation(summary = "Validate a saved automatic-repost requester for Order Service",
            description = "Private service network only, no user JWT. Uses current requester role; a missing/deleted account cannot repost.")
    @ApiResponse(responseCode = "200", description = "User ID and current eligibility")
    @ApiResponse(responseCode = "400", description = "Invalid user ID")
    @ApiResponse(responseCode = "404", description = "User no longer exists")
    public RequesterResult requester(@Parameter(description = "Saved plan owner UID") @PathVariable String userId) {
        if (userId.isBlank() || userId.length() > 128) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid user ID");
        }
        // Do not use verifyRequester(User): that legacy helper inverts role membership.
        sg.edu.nus.foc.user.model.User user = users.getUserByUserId(userId);
        boolean eligible = user.getStatus() == sg.edu.nus.foc.user.model.AccountStatus.ACTIVE
                && user.getRoles() != null && user.getRoles().contains("requester");
        return new RequesterResult(user.getUserId(), eligible);
    }
}
