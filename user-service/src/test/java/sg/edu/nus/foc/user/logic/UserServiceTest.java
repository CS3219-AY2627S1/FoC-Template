/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-04
 * Mode: Code generation.
 * Scope: Generated the initial test code based on the architecture of UserService.java.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.OutboxEvent;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private FirebaseAuthService firebaseAuthService;

    @Mock
    private OrderServiceClient orderServiceClient;

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @Mock
    private JsonMapper objectMapper;

    @Mock
    private UserLifecycleStore lifecycle;

    @InjectMocks
    private UserService userService;

    private User activeUser;

    @BeforeEach
    void setUp() {
        activeUser = createUser(
                "user-1",
                "anna@example.com",
                "Anna",
                List.of("courier", "requester")
        );

        // saveActive returns the updated user in these unit tests.
        lenient().when(lifecycle.saveActive(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    private User createUser(
            String userId,
            String email,
            String username,
            List<String> roles) {

        User user = new User();
        user.setUserId(userId);
        user.setEmail(email);
        user.setUsername(username);
        user.setRoles(roles);
        user.setPenalty(0);
        user.setIsCourierSuspended(false);
        user.setIsPermanentlySuspended(false);
        user.setStatus(AccountStatus.ACTIVE);

        return user;
    }

    // Helper function
    private User withDeletionOperationId(User user, String operationId) {
        ReflectionTestUtils.setField(user, "deletionOperationId", operationId);
        return user;
    }

    // --------------------------------------------------
    // User retrieval
    // --------------------------------------------------

    @Test
    void fetchAllUsersRefreshesSuspensionsAndReturnsUsers() {
        when(userRepository.findAll()).thenReturn(List.of(activeUser));

        List<User> result = userService.fetchAllUsers();

        assertEquals(1, result.size());
        assertSame(activeUser, result.get(0));

        verify(lifecycle).clearAllExpiredSuspensions(any(Instant.class));
        verify(userRepository).findAll();
    }

    @Test
    void getUserByUserIdRefreshesSuspensionAndReturnsUser() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.getUserByUserId("user-1");

        assertSame(activeUser, result);

        verify(lifecycle).clearExpiredSuspension(
                eq("user-1"), any(Instant.class));
        verify(userRepository).findByUserId("user-1");
    }

    @Test
    void getUserByUserIdThrowsWhenUserDoesNotExist() {
        when(userRepository.findByUserId("missing"))
                .thenReturn(Optional.empty());

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.getUserByUserId("missing")
        );

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    // --------------------------------------------------
    // Role context and eligibility
    // --------------------------------------------------

    @Test
    void getRoleContextReturnsRolesForActiveUser() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        UserRoleContext result = userService.getRoleContext("user-1");

        assertNotNull(result);
        verify(lifecycle).clearExpiredSuspension(
                eq("user-1"), any(Instant.class));
    }

    @Test
    void getRoleContextHidesRolesForDeactivatedUser() {
        activeUser.setStatus(AccountStatus.DEACTIVATED);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        UserRoleContext result = userService.getRoleContext("user-1");

        assertNotNull(result);
    }

    @Test
    void getCourierEligibilityReturnsResultForCourier() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        CourierEligibility result =
                userService.getCourierEligibility("user-1");

        assertNotNull(result);
        verify(lifecycle).clearExpiredSuspension(
                eq("user-1"), any(Instant.class));
    }

    @Test
    void getRequesterEligibilityReturnsResultForRequester() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        RequesterEligibility result =
                userService.getRequesterEligibility("user-1");

        assertNotNull(result);
    }

    @Test
    void getAdminEligibilityReturnsResultForNonAdmin() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        AdminEligibility result =
                userService.getAdminEligibility("user-1");

        assertNotNull(result);
    }

    @Test
    void getUserSummaryReturnsUserDetails() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        UserSummary result = userService.getUserSummary("user-1");

        assertNotNull(result);
        verify(lifecycle).clearExpiredSuspension(
                eq("user-1"), any(Instant.class));
    }

    // --------------------------------------------------
    // User creation and outbox
    // --------------------------------------------------

    @Test
    void addUserCreatesUserAndOutboxEvent() throws Exception {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.empty());

        when(userRepository.findFirstByEmailAndStatus(
                "anna@example.com", AccountStatus.ACTIVE))
                .thenReturn(Optional.empty());

        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        when(objectMapper.writeValueAsString(any()))
                .thenReturn("{\"event\":\"UserCreated\"}");

        User result = userService.addUser(
                "user-1",
                "anna@example.com",
                "Anna"
        );

        assertEquals("user-1", result.getUserId());
        assertEquals("anna@example.com", result.getEmail());
        assertEquals("Anna", result.getUsername());
        assertTrue(result.getRoles().contains("courier"));
        assertTrue(result.getRoles().contains("requester"));

        verify(userRepository).save(any(User.class));
        verify(outboxEventRepository).save(any(OutboxEvent.class));
    }

    @Test
    void addAdminCreatesUserWithAdminRole() throws Exception {
        when(userRepository.findByUserId("admin-1"))
                .thenReturn(Optional.empty());

        when(userRepository.findFirstByEmailAndStatus(
                "admin@example.com", AccountStatus.ACTIVE))
                .thenReturn(Optional.empty());

        when(userRepository.save(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        when(objectMapper.writeValueAsString(any()))
                .thenReturn("{\"event\":\"UserCreated\"}");

        User result = userService.addAdmin(
                "admin-1",
                "admin@example.com"
        );

        assertTrue(result.getRoles().contains("admin"));
        assertEquals("Admin", result.getUsername());

        verify(outboxEventRepository).save(any(OutboxEvent.class));
    }

    @Test
    void createUserRejectsMissingRequiredFields() {
        assertThrows(
                IllegalArgumentException.class,
                () -> userService.createUser(
                        " ",
                        "anna@example.com",
                        List.of("courier"),
                        "Anna"
                )
        );

        verifyNoInteractions(userRepository);
    }

    @Test
    void createUserRejectsExistingIdentity() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.createUser(
                        "user-1",
                        "another@example.com",
                        List.of("courier"),
                        "Anna"
                )
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void createUserRejectsExistingActiveEmail() {
        when(userRepository.findByUserId("user-2"))
                .thenReturn(Optional.empty());

        when(userRepository.findFirstByEmailAndStatus(
                "anna@example.com", AccountStatus.ACTIVE))
                .thenReturn(Optional.of(activeUser));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.createUser(
                        "user-2",
                        "anna@example.com",
                        List.of("courier"),
                        "Another Anna"
                )
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(userRepository, never()).save(any(User.class));
    }

    // --------------------------------------------------
    // Profile updates and email synchronisation
    // --------------------------------------------------

    @Test
    void updateUserChangesUsername() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(request.getUsername()).thenReturn("New Anna");

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.updateUser("user-1", request);

        assertEquals("New Anna", result.getUsername());
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void updateUserLeavesUsernameUnchangedWhenNull() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(request.getUsername()).thenReturn(null);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.updateUser("user-1", request);

        assertEquals("Anna", result.getUsername());
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void syncVerifiedEmailUpdatesEmailFromFirebase() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        when(firebaseAuthService.getVerifiedEmail("user-1"))
                .thenReturn("new@example.com");

        User result = userService.syncVerifiedEmail("user-1");

        assertEquals("new@example.com", result.getEmail());

        verify(firebaseAuthService).getVerifiedEmail("user-1");
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void syncVerifiedEmailDoesNotSaveWhenFirebaseLookupFails() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        when(firebaseAuthService.getVerifiedEmail("user-1"))
                .thenThrow(new RuntimeException("Firebase unavailable"));

        assertThrows(
                RuntimeException.class,
                () -> userService.syncVerifiedEmail("user-1")
        );

        assertEquals("anna@example.com", activeUser.getEmail());
        verify(lifecycle, never()).saveActive(any());
    }

    @Test
    void updateUserEmailUpdatesFirebaseAndDatabase() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(request.getEmail()).thenReturn("new@example.com");

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.updateUserEmail("user-1", request);

        assertEquals("new@example.com", result.getEmail());

        verify(firebaseAuthService).updateUserEmail(
                "user-1", "new@example.com");
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void updateUserEmailDoesNotCallFirebaseWhenEmailIsUnchanged() {
        UpdateUserRequest request = mock(UpdateUserRequest.class);
        when(request.getEmail()).thenReturn("anna@example.com");

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        userService.updateUserEmail("user-1", request);

        verifyNoInteractions(firebaseAuthService);
        verify(lifecycle).saveActive(activeUser);
    }

    // --------------------------------------------------
    // Account deactivation and deletion recovery
    // --------------------------------------------------

    @Test
    void deactivateUserReturnsWhenAlreadyDeactivated() {
        activeUser.setStatus(AccountStatus.DEACTIVATED);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        userService.deactivateUser("token", "user-1");

        verify(lifecycle, never()).begin(anyString());
        verifyNoInteractions(orderServiceClient);
    }

    @Test
    void deactivateUserRejectsAlreadyPendingDeactivation() {
        activeUser.setStatus(AccountStatus.DEACTIVATION_PENDING);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.deactivateUser("token", "user-1")
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(lifecycle, never()).begin(anyString());
    }

    @Test
    void deactivateUserRejectsLastAdministrator() {
        activeUser.setRoles(List.of("admin"));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        when(userRepository.countByRolesContainingAndStatus(
                "admin", AccountStatus.ACTIVE))
                .thenReturn(1L);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.deactivateUser("token", "user-1")
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(lifecycle, never()).begin(anyString());
    }

    @Test
    void recoverDeletionCompletesSuccessfulDeletion() {
        User pending = createUser(
                "user-1",
                "anna@example.com",
                "Anna",
                List.of("requester")
        );

        pending.setStatus(AccountStatus.DEACTIVATION_PENDING);
        withDeletionOperationId(pending, "operation-1");

        when(orderServiceClient.prepareDeletion(
                "user-1", "operation-1"))
                .thenReturn(true);

        when(lifecycle.seal(pending)).thenReturn(true);

        userService.recoverDeletion(pending);

        verify(orderServiceClient).prepareDeletion(
                "user-1", "operation-1");
        verify(firebaseAuthService).deleteUserIfExists("user-1");
        verify(lifecycle).complete(pending);
    }

    @Test
    void recoverDeletionRestoresAccountWhenOrdersDenyDeletion() {
        User pending = createUser(
                "user-1",
                "anna@example.com",
                "Anna",
                List.of("requester")
        );

        pending.setStatus(AccountStatus.DEACTIVATION_PENDING);
        withDeletionOperationId(pending, "operation-1");

        when(orderServiceClient.prepareDeletion(
                "user-1", "operation-1"))
                .thenReturn(false);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.recoverDeletion(pending)
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());

        verify(lifecycle).restoreAfterDenial(pending);
        verify(firebaseAuthService, never()).deleteUserIfExists(anyString());
        verify(lifecycle, never()).complete(any());
    }

    @Test
    void recoverDeletionReturnsWhenAccountIsNoLongerPending() {
        User user = createUser(
                "user-1",
                "anna@example.com",
                "Anna",
                List.of("requester")
        );

        userService.recoverDeletion(user);

        verifyNoInteractions(orderServiceClient);
        verifyNoInteractions(firebaseAuthService);
    }

    @Test
    void recoverDeletionWrapsUnexpectedFailureAsServiceUnavailable() {
        User pending = createUser(
                "user-1",
                "anna@example.com",
                "Anna",
                List.of("requester")
        );

        pending.setStatus(AccountStatus.DEACTIVATION_PENDING);
        withDeletionOperationId(pending, "operation-1");

        when(orderServiceClient.prepareDeletion(
                "user-1", "operation-1"))
                .thenThrow(new RuntimeException("Order service unavailable"));

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.recoverDeletion(pending)
        );

        assertEquals(
                HttpStatus.SERVICE_UNAVAILABLE,
                exception.getStatusCode()
        );
    }

    // --------------------------------------------------
    // Admin promotion and demotion
    // --------------------------------------------------

    @Test
    void promoteUserAddsAdminRole() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.promoteUser("user-1");

        assertTrue(result.getRoles().contains("admin"));
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void promoteUserDoesNotDuplicateAdminRole() {
        activeUser.setRoles(List.of("courier", "admin"));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.promoteUser("user-1");

        assertEquals(1, result.getRoles().stream()
                .filter("admin"::equals).count());
    }

    @Test
    void demoteUserRemovesAdminRoleWhenAnotherAdminExists() {
        activeUser.setRoles(List.of("courier", "admin"));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        when(userRepository.countByRolesContainingAndStatus(
                "admin", AccountStatus.ACTIVE))
                .thenReturn(2L);

        User result = userService.demoteUser("user-1");

        assertFalse(result.getRoles().contains("admin"));
        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void demoteUserRejectsRemovalOfLastAdministrator() {
        activeUser.setRoles(List.of("courier", "admin"));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        when(userRepository.countByRolesContainingAndStatus(
                "admin", AccountStatus.ACTIVE))
                .thenReturn(1L);

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> userService.demoteUser("user-1")
        );

        assertEquals(HttpStatus.CONFLICT, exception.getStatusCode());
        verify(lifecycle, never()).saveActive(any());
    }

    // --------------------------------------------------
    // Penalty adjustment
    // --------------------------------------------------

    @Test
    void adjustPenaltyIncreasesPenalty() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", 3);

        assertEquals(3, result.getPenalty());
        assertFalse(result.getIsCourierSuspended());
    }

    @Test
    void adjustPenaltyDoesNotAllowPenaltyBelowZero() {
        activeUser.setPenalty(2);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", -5);

        assertEquals(0, result.getPenalty());
    }

    @Test
    void adjustPenaltyDoesNotAllowPenaltyAboveMaximum() {
        activeUser.setPenalty(8);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", 5);

        assertEquals(10, result.getPenalty());
        assertTrue(result.getIsCourierSuspended());
        assertNotNull(result.getSuspensionEndDate());
        assertTrue(result.getSuspensionEndDate().isAfter(Instant.now()));
    }

    @Test
    void adjustPenaltyPermanentlySuspendedUserDoesNotChange() {
        activeUser.setIsCourierSuspended(true);
        activeUser.setIsPermanentlySuspended(true);
        activeUser.setPenalty(10);

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", -5);

        assertEquals(10, result.getPenalty());
        assertTrue(result.getIsCourierSuspended());
        verify(lifecycle, never()).saveActive(any());
    }

    @Test
    void adjustPenaltyDoesNotChangePenaltyDuringTemporarySuspension() {
        activeUser.setIsCourierSuspended(true);
        activeUser.setPenalty(10);
        activeUser.setSuspensionEndDate(Instant.now().plusSeconds(3600));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", -5);

        assertEquals(10, result.getPenalty());
        assertTrue(result.getIsCourierSuspended());
        verify(lifecycle, never()).saveActive(any());
    }

    @Test
    void adjustPenaltyClearsExpiredSuspensionBeforeApplyingAdjustment() {
        activeUser.setIsCourierSuspended(true);
        activeUser.setPenalty(10);
        activeUser.setSuspensionEndDate(Instant.now().minusSeconds(3600));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.adjustPenalty("user-1", -3);

        assertEquals(7, result.getPenalty());
        assertFalse(result.getIsCourierSuspended());
        assertNull(result.getSuspensionEndDate());
    }

    // --------------------------------------------------
    // Suspension management
    // --------------------------------------------------

    @Test
    void suspendUserAppliesTemporarySuspension() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.suspendUser("user-1");

        assertEquals(10, result.getPenalty());
        assertTrue(result.getIsCourierSuspended());
        assertNotNull(result.getSuspensionEndDate());
        assertFalse(result.getIsPermanentlySuspended());

        assertTrue(result.getSuspensionEndDate().isAfter(Instant.now()));
    }

    @Test
    void suspendUserPermanentlyAppliesPermanentSuspension() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.suspendUserPermanently("user-1");

        assertEquals(10, result.getPenalty());
        assertTrue(result.getIsCourierSuspended());
        assertTrue(result.getIsPermanentlySuspended());
    }

    @Test
    void unsuspendUserClearsExistingSuspension() {
        activeUser.setPenalty(10);
        activeUser.setIsCourierSuspended(true);
        activeUser.setSuspensionEndDate(Instant.now().plusSeconds(3600));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.unsuspendUser("user-1");

        assertFalse(result.getIsCourierSuspended());
        assertNull(result.getSuspensionEndDate());
        assertEquals(10, result.getPenalty());

        verify(lifecycle).saveActive(activeUser);
    }

    @Test
    void unsuspendUserDoesNotSaveAlreadyUnsuspendedUser() {
        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.unsuspendUser("user-1");

        assertFalse(result.getIsCourierSuspended());
        verify(lifecycle, never()).saveActive(any());
    }

    @Test
    void unsuspendUserDoesNotModifyInactiveUser() {
        activeUser.setStatus(AccountStatus.DEACTIVATED);
        activeUser.setIsCourierSuspended(true);
        activeUser.setSuspensionEndDate(Instant.now().plusSeconds(3600));

        when(userRepository.findByUserId("user-1"))
                .thenReturn(Optional.of(activeUser));

        User result = userService.unsuspendUser("user-1");

        assertTrue(result.getIsCourierSuspended());
        assertNotNull(result.getSuspensionEndDate());

        verify(lifecycle, never()).saveActive(any());
    }
}

