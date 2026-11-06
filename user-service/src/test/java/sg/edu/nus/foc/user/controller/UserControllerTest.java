/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code based on the architecture of UserController.java.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

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

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    private static final String USER_ID = "user-123";
    private static final String EMAIL = "anna@u.nus.edu";
    private static final String TOKEN_VALUE = "test-firebase-token";

    @Mock
    private UserService userService;

    @InjectMocks
    private UserController userController;

    private User user;
    private JwtAuthenticationToken authentication;

    @BeforeEach
    void setUp() {
        user = new User();
        user.setUserId(USER_ID);
        user.setEmail(EMAIL);
        user.setUsername("Anna");
        user.setRoles(List.of("courier", "requester"));

        Jwt jwt = Jwt.withTokenValue(TOKEN_VALUE)
                .header("alg", "none")
                .subject(USER_ID)
                .claim("email", EMAIL)
                .build();

        authentication = new JwtAuthenticationToken(jwt);
    }

    // --------------------------------------------------
    // User retrieval
    // --------------------------------------------------

    @Test
    void fetchAllUsersReturnsAllUsers() {
        List<User> users = List.of(user);
        when(userService.fetchAllUsers()).thenReturn(users);

        ResponseEntity<List<User>> response =
                userController.fetchAllUsers();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(users, response.getBody());

        verify(userService).fetchAllUsers();
    }

    @Test
    void getUserReturnsRequestedUser() {
        when(userService.getUserByUserId(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.getUser(USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).getUserByUserId(USER_ID);
    }

    @Test
    void getRoleContextUsesAuthenticatedUserId() {
        UserRoleContext context = mock(UserRoleContext.class);
        when(userService.getRoleContext(USER_ID)).thenReturn(context);

        ResponseEntity<UserRoleContext> response =
                userController.getRoleContext(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(context, response.getBody());

        verify(userService).getRoleContext(USER_ID);
    }

    @Test
    void getCourierEligibilityUsesAuthenticatedUserId() {
        CourierEligibility eligibility = mock(CourierEligibility.class);
        when(userService.getCourierEligibility(USER_ID))
                .thenReturn(eligibility);

        ResponseEntity<CourierEligibility> response =
                userController.getCourierEligibility(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(eligibility, response.getBody());

        verify(userService).getCourierEligibility(USER_ID);
    }

    @Test
    void getRequesterEligibilityUsesAuthenticatedUserId() {
        RequesterEligibility eligibility = mock(RequesterEligibility.class);
        when(userService.getRequesterEligibility(USER_ID))
                .thenReturn(eligibility);

        ResponseEntity<RequesterEligibility> response =
                userController.getRequesterEligibility(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(eligibility, response.getBody());

        verify(userService).getRequesterEligibility(USER_ID);
    }

    @Test
    void getAdminEligibilityUsesAuthenticatedUserId() {
        AdminEligibility eligibility = mock(AdminEligibility.class);
        when(userService.getAdminEligibility(USER_ID))
                .thenReturn(eligibility);

        ResponseEntity<AdminEligibility> response =
                userController.getAdminEligibility(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(eligibility, response.getBody());

        verify(userService).getAdminEligibility(USER_ID);
    }

    @Test
    void getUserSummaryReturnsRequestedSummary() {
        UserSummary summary = mock(UserSummary.class);
        when(userService.getUserSummary(USER_ID)).thenReturn(summary);

        ResponseEntity<UserSummary> response =
                userController.getUserSummary(USER_ID);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(summary, response.getBody());

        verify(userService).getUserSummary(USER_ID);
    }

    @Test
    void getMyProfileUsesAuthenticatedUserId() {
        when(userService.getUserByUserId(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.getMyProfile(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).getUserByUserId(USER_ID);
    }

    // --------------------------------------------------
    // User creation
    // --------------------------------------------------

    @Test
    void addUserUsesAuthenticatedClaimsAndReturnsCreated() {
        AddUserRequest request = mock(AddUserRequest.class);
        when(request.getUsername()).thenReturn("Anna");
        when(userService.addUser(USER_ID, EMAIL, "Anna"))
                .thenReturn(user);

        ResponseEntity<User> response =
                userController.addUser(request, authentication);

        assertEquals(HttpStatus.CREATED, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).addUser(USER_ID, EMAIL, "Anna");
    }

    // --------------------------------------------------
    // Profile updates and email synchronisation
    // --------------------------------------------------

    @Test
    void syncUserEmailUsesAuthenticatedUserId() {
        when(userService.syncVerifiedEmail(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.syncUserEmail(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).syncVerifiedEmail(USER_ID);
    }

    @Test
    void updateSelfUsesAuthenticatedUserId() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(userService.updateUser(USER_ID, request)).thenReturn(user);

        ResponseEntity<User> response =
                userController.updateSelf(request, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).updateUser(USER_ID, request);
    }

    @Test
    void updateUserUsesProvidedUserId() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(userService.updateUser(USER_ID, request)).thenReturn(user);

        ResponseEntity<User> response =
                userController.updateUser(USER_ID, request, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).updateUser(USER_ID, request);
    }

    // --------------------------------------------------
    // Admin role management
    // --------------------------------------------------

    @Test
    void promoteUserReturnsPromotedUser() {
        when(userService.promoteUser(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.promoteUser(USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).promoteUser(USER_ID);
    }

    @Test
    void demoteUserReturnsDemotedUser() {
        when(userService.demoteUser(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.demoteUser(USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).demoteUser(USER_ID);
    }

    // --------------------------------------------------
    // Penalty management
    // --------------------------------------------------

    @Test
    void updateUserPenaltyUsesRequestPenalty() {
        ApplyPenaltyRequest request = mock(ApplyPenaltyRequest.class);
        when(request.getPenalty()).thenReturn(3);
        when(userService.adjustPenalty(USER_ID, 3)).thenReturn(user);

        ResponseEntity<User> response =
                userController.updateUserPenalty(USER_ID, request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).adjustPenalty(USER_ID, 3);
    }

    // --------------------------------------------------
    // Account deactivation
    // --------------------------------------------------

    @Test
    void deactivateSelfUsesAuthenticatedTokenAndUserId() {
        ResponseEntity<String> response =
                userController.deactivateSelf(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("User's own account disabled", response.getBody());

        verify(userService).deactivateUser(TOKEN_VALUE, USER_ID);
    }

    @Test
    void deactivateUserUsesProvidedUserIdAndRequesterToken() {
        ResponseEntity<String> response =
                userController.deactivateUser(USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("User disabled", response.getBody());

        verify(userService).deactivateUser(TOKEN_VALUE, USER_ID);
    }

    // --------------------------------------------------
    // Suspension management
    // --------------------------------------------------

    @Test
    void updateUserSuspensionReturnsSuspendedUser() {
        when(userService.suspendUser(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.updateUserSuspension(USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).suspendUser(USER_ID);
    }

    @Test
    void updateUserSuspensionRemovalReturnsUnsuspendedUser() {
        when(userService.unsuspendUser(USER_ID)).thenReturn(user);

        ResponseEntity<User> response =
                userController.updateUserSuspensionRemoval(
                        USER_ID, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertSame(user, response.getBody());

        verify(userService).unsuspendUser(USER_ID);
    }

    // --------------------------------------------------
    // Exception propagation
    // --------------------------------------------------

    @Test
    void getUserPropagatesServiceException() {
        ResponseStatusException expected = new ResponseStatusException(
                HttpStatus.NOT_FOUND, "User not found");

        when(userService.getUserByUserId(USER_ID))
                .thenThrow(expected);

        ResponseStatusException actual = assertThrows(
                ResponseStatusException.class,
                () -> userController.getUser(USER_ID, authentication)
        );

        assertSame(expected, actual);
        verify(userService).getUserByUserId(USER_ID);
    }

    @Test
    void deactivateSelfPropagatesServiceException() {
        ResponseStatusException expected = new ResponseStatusException(
                HttpStatus.CONFLICT, "Cannot disable account");

        doThrow(expected).when(userService)
                .deactivateUser(TOKEN_VALUE, USER_ID);

        ResponseStatusException actual = assertThrows(
                ResponseStatusException.class,
                () -> userController.deactivateSelf(authentication)
        );

        assertSame(expected, actual);
    }
}
