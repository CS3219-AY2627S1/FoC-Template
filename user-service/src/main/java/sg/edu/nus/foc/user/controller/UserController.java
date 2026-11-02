package sg.edu.nus.foc.user.controller;

import io.swagger.v3.oas.annotations.Operation;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import com.google.firebase.auth.FirebaseToken;

import sg.edu.nus.foc.user.authentication.AuthenticationService;
import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.logic.AddUserRequest;
import sg.edu.nus.foc.user.logic.ApplyPenaltyRequest;
import sg.edu.nus.foc.user.logic.AdminEligibility;
import sg.edu.nus.foc.user.logic.CourierEligibility;
import sg.edu.nus.foc.user.logic.RequesterEligibility;
import sg.edu.nus.foc.user.logic.UpdateUserRequest;
import sg.edu.nus.foc.user.logic.UserRoleContext;
import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.logic.UserSummary;
import sg.edu.nus.foc.user.model.User;

@RestController
@RequestMapping("/api/users")
public class UserController {
    private static final String ADMIN_ONLY = "@callerRoles.isAdmin(authentication)";

    private final AuthenticationService authenticationService;
    private final UserService userService;

    public UserController(
            UserService userService,
            AuthenticationService authenticationService) {

        this.userService = userService;
        this.authenticationService = authenticationService;
    }

    // GET /api/users
    // Only admins can retrieve all user info
    @Operation(summary = "Get all users")
    @GetMapping
    @PreAuthorize(ADMIN_ONLY)
    public ResponseEntity<List<User>> fetchAllUsers() {
        return ResponseEntity.ok(userService.fetchAllUsers());
    }

    // GET /api/users/:userId
    // Only admins can get full info of a specific user
    @Operation(summary = "Get specific user based on userId")
    @GetMapping("/{userId}")
    @PreAuthorize(ADMIN_ONLY)
    public ResponseEntity<User> getUser(
            @PathVariable String userId,
            JwtAuthenticationToken authentication) {

        User user = userService.getUserByUserId(userId);

        return ResponseEntity.ok(user);
    }

    // GET /api/users/role-context/
    // Used for checking if a user is of a certain role for certain actions
    @Operation(summary = "Get requesting user's roles from auth token")
    @GetMapping("/role-context")
    public ResponseEntity<UserRoleContext> getRoleContext(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();

        return ResponseEntity.ok(
                userService.getRoleContext(userId)
        );
    }


    // GET /api/users/courier-eligibility/
    @Operation(summary = "Get requesting user's courier eligibility from auth token")
    @GetMapping("/courier-eligibility")
    public ResponseEntity<CourierEligibility> getCourierEligibility(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();

        return ResponseEntity.ok(
                userService.getCourierEligibility(userId)
        );
    }

    // GET /api/users/requester-eligibility/
    @Operation(summary = "Get requesting user's requester eligibility from auth token")
    @GetMapping("/requester-eligibility")
    public ResponseEntity<RequesterEligibility> getRequesterEligibility(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();

        return ResponseEntity.ok(
                userService.getRequesterEligibility(userId)
        );
    }

    // GET /api/users/admin-eligibility/
    @Operation(summary = "Get requesting user's requester eligibility from auth token")
    @GetMapping("/admin-eligibility")
    public ResponseEntity<AdminEligibility> getAdminEligibility(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();

        return ResponseEntity.ok(
                userService.getAdminEligibility(userId)
        );
    }


    // GET /api/users/summary/:userId
    @Operation(summary = "Get user summary from user id")
    @GetMapping("/summary/{userId}")
    public ResponseEntity<UserSummary> getUserSummary(
            @PathVariable String userId) {

        return ResponseEntity.ok(
                userService.getUserSummary(userId)
        );
    }

    // GET /api/users/me
    @Operation(summary = "Get requesting user's own information from auth token")
    @GetMapping("/me")
    public ResponseEntity<User> getMyProfile(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();

        User user = userService.getUserByUserId(userId);

        return ResponseEntity.ok(user);
    }

    // POST /api/users/
    // Only accepts username, email and userId
    @Operation(summary = "Add user into database")
    @PostMapping
    public ResponseEntity<User> addUser(
            @RequestBody AddUserRequest addUserRequest,
            JwtAuthenticationToken authentication) {

        // Extract username from request
        String username = addUserRequest.getUsername();

        // Extract claims from the already-validated token
        String userId = authentication.getToken().getSubject();
        String email = authentication.getToken().getClaimAsString("email");

        User user = userService.addUser(userId, email, username);

        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }

    // POST /api/users/me/email-sync
    // Update own email info
    @Operation(summary = "Synchronise requesting user's email in MongoDB with Firebase")
    @PostMapping("/me/email-sync")
    public ResponseEntity<User> syncUserEmail(
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();
        User user = userService.syncVerifiedEmail(userId);

        return ResponseEntity.ok(user);
    }

    // PUT /api/users/me
    // Update own info
    @Operation(summary = "Update requesting user's own info")
    @PutMapping("/me")
    public ResponseEntity<User> updateSelf(
            @RequestBody UpdateUserRequest request,
            JwtAuthenticationToken authentication) {

        String userId = authentication.getToken().getSubject();
        User user = userService.updateUser(userId, request);

        return ResponseEntity.ok(user);
    }

    // PUT /api/users/:userId
    // Only admin can update other users' info
    @Operation(summary = "Update any user's info")
    @PreAuthorize(ADMIN_ONLY)
    @PutMapping("/{userId}")
    public ResponseEntity<User> updateUser(
            @PathVariable String userId,
            @RequestBody UpdateUserRequest request,
            JwtAuthenticationToken authentication) {

        User user = userService.updateUser(userId, request);

        return ResponseEntity.ok(user);
    }

    // PUT /api/users/:userId/user-promotion
    // Only admin can update other users' info
    @Operation(summary = "Promote a user to admin")
    @PreAuthorize(ADMIN_ONLY)
    @PutMapping("/{userId}/user-promotion")
    public ResponseEntity<User> promoteUser(
            @PathVariable String userId,
            JwtAuthenticationToken authentication) {

        User promotedUser = userService.promoteUser(userId);

        return ResponseEntity.ok(promotedUser);
    }

    // PUT /api/users/:userId/user-demotion
    // Only admin can update other users' info
    @Operation(summary = "Demote an admin to regular user")
    @PreAuthorize(ADMIN_ONLY)
    @PutMapping("/{userId}/user-demotion")
    public ResponseEntity<User> demoteUser(
            @PathVariable String userId,
            JwtAuthenticationToken authentication) {

        User promotedUser = userService.demoteUser(userId);

        return ResponseEntity.ok(promotedUser);
    }

    // PUT /api/users/{userId}/penalty
    // Only used by other services
    @Operation(summary = "Update any user's penalty")
    @PutMapping("/{userId}/penalty")
    public ResponseEntity<User> updateUserPenalty(
            @PathVariable String userId,
            @RequestBody ApplyPenaltyRequest request) {

        User user = userService.adjustPenalty(userId, request.getPenalty());

        return ResponseEntity.ok(user);
    }

    // DELETE /api/users/me
    @Operation(summary = "Delete user from Firebase, disables MongoDB user doc")
    @DeleteMapping("/me")
    public ResponseEntity<String> deactivateSelf(
            JwtAuthenticationToken authentication) {

        String token = authentication.getToken().getTokenValue();
        String userId = authentication.getToken().getSubject();

        userService.deactivateUser(token, userId);

        return ResponseEntity.ok("User's own account disabled");
    }

    // DELETE /api/users/:id
    // Only admins can delete other users
    @Operation(summary = "Delete specified user from Firebase, disables MongoDB user doc")
    @PreAuthorize(ADMIN_ONLY)
    @DeleteMapping("/{userId}")
    public ResponseEntity<String> deactivateUser(
            @PathVariable String userId,
            JwtAuthenticationToken authentication) {

        String requesterToken = authentication.getToken().getTokenValue();

        userService.deactivateUser(requesterToken, userId);

        return ResponseEntity.ok("User disabled");
    }

    // TODO: GET /api/users?searchBy=name&q=Alex&page=1&size=20

    // TODO: PUT or POST /api/users/:userid/suspension
    // Admin manual suspension
    @Operation(summary = "Manually suspend a user")
    @PreAuthorize(ADMIN_ONLY)
    @PutMapping("/{userId}/suspension")
    public ResponseEntity<User> updateUserSuspension(
            @PathVariable String userId,
            @RequestBody UpdateUserRequest request,
            JwtAuthenticationToken authentication) {

        User user = userService.suspendUser(userId);

        return ResponseEntity.ok(user);
    }
}

