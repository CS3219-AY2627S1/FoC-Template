package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;
import tools.jackson.databind.json.JsonMapper;

class AccountDeletionSafetyTest {
    private final UserRepository repository = mock(UserRepository.class);
    private final FirebaseAuthService firebase = mock(FirebaseAuthService.class);
    private final OrderServiceClient orders = mock(OrderServiceClient.class);
    private final UserLifecycleStore lifecycle = mock(UserLifecycleStore.class);
    private final UserService service = new UserService(repository, firebase, orders,
            mock(OutboxEventRepository.class), JsonMapper.builder().build(), lifecycle);
    private User user;

    @BeforeEach
    void account() {
        user = new User();
        user.setUserId("student");
        user.setRoles(List.of("requester", "courier"));
        when(repository.findByUserId("student")).thenReturn(Optional.of(user));
        when(lifecycle.begin("student")).thenAnswer(call -> { pending(user, "op"); return user; });
        when(lifecycle.seal(any())).thenReturn(true);
        when(lifecycle.restoreAfterDenial(any())).thenAnswer(call -> {
            ((User) call.getArgument(0)).setStatus(AccountStatus.ACTIVE); return true;
        });
        doAnswer(call -> { ((User) call.getArgument(0)).setStatus(AccountStatus.DEACTIVATED); return null; })
                .when(lifecycle).complete(any());
    }

    @Test
    void authoritativeActiveOrderDenialRestoresAccountWithoutDeletingIdentity() {
        when(orders.prepareDeletion("student", "op")).thenReturn(false);
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> service.deactivateUser("caller-token", "student"));
        assertEquals(HttpStatus.CONFLICT, failure.getStatusCode());
        assertEquals(AccountStatus.ACTIVE, user.getStatus());
        verify(lifecycle).restoreAfterDenial(user);
        verifyNoInteractions(firebase);
        verify(repository, never()).save(any());
    }

    @Test
    void lostPreparationReplyStaysPendingAndRecoveryReusesExactlyTheSameOperation() {
        when(orders.prepareDeletion("student", "op"))
                .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE)).thenReturn(true);
        ResponseStatusException failure = assertThrows(ResponseStatusException.class,
                () -> service.deactivateUser("caller-token", "student"));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
        assertEquals(AccountStatus.DEACTIVATION_PENDING, user.getStatus());
        verifyNoInteractions(firebase);
        verify(lifecycle, never()).restoreAfterDenial(any());
        service.recoverDeletion(user);
        verify(orders, times(2)).prepareDeletion("student", "op");
        verify(firebase).deleteUserIfExists("student");
        assertEquals(AccountStatus.DEACTIVATED, user.getStatus());
    }

    @Test
    void barrierBeforeFirebaseAndConditionalCompletionRetainHistoricalMongoDocument() {
        when(orders.prepareDeletion("student", "op")).thenReturn(true);
        service.deactivateUser("caller-token", "student");
        org.mockito.InOrder sequence = inOrder(lifecycle, orders, firebase);
        sequence.verify(lifecycle).begin("student");
        sequence.verify(orders).prepareDeletion("student", "op");
        sequence.verify(lifecycle).seal(user);
        sequence.verify(firebase).deleteUserIfExists("student");
        sequence.verify(lifecycle).complete(user);
        assertEquals(AccountStatus.DEACTIVATED, user.getStatus());
        verify(repository, never()).delete(any());
        verify(repository, never()).save(any());
    }

    // Some interaction with lifecycle expected due to refreshSuspensionStatus
    @Test
    void lastAdministratorRuleIsPreserved() {
        user.setRoles(List.of("admin"));
        when(repository.countByRolesContainingAndStatus("admin", AccountStatus.ACTIVE)).thenReturn(1L);
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> service.deactivateUser("admin-token", "student")).getStatusCode());
        verify(lifecycle).clearExpiredSuspension(eq("student"), any(Instant.class));
        verifyNoMoreInteractions(lifecycle);
        verifyNoInteractions(orders, firebase);
    }

    @Test
    void uncertainFirebaseOutcomeRemainsPendingAndCannotRestoreActive() {
        when(orders.prepareDeletion("student", "op")).thenReturn(true);
        doThrow(new IllegalStateException("lost Firebase response")).when(firebase).deleteUserIfExists("student");
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ResponseStatusException.class,
                () -> service.deactivateUser("caller-token", "student")).getStatusCode());
        assertEquals(AccountStatus.DEACTIVATION_PENDING, user.getStatus());
        verify(lifecycle, never()).complete(any());
        verify(lifecycle, never()).restoreAfterDenial(any());
    }

    @Test
    void recoveryUsesSameGuardAndContinuesLaterUsersAfterDependencyFailure() {
        User safe = new User(); safe.setUserId("safe"); pending(safe, "safe-op"); pending(user, "op");
        when(repository.findByStatus(AccountStatus.DEACTIVATION_PENDING)).thenReturn(List.of(user, safe));
        when(orders.prepareDeletion("student", "op")).thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
        when(orders.prepareDeletion("safe", "safe-op")).thenReturn(true);
        assertDoesNotThrow(() -> new AccountDeletionRecoveryJob(repository, service).recoverPendingDeletions());
        assertEquals(AccountStatus.DEACTIVATION_PENDING, user.getStatus());
        verify(firebase, never()).deleteUserIfExists("student");
        verify(firebase).deleteUserIfExists("safe");
        assertEquals(AccountStatus.DEACTIVATED, safe.getStatus());
    }

    // No interaction with lifecycle as refreshSuspensionStatus now terminates early
    // with inactive accounts
    @Test
    void completedAndAlreadyPendingRequestsDoNotStartAnotherOperation() {
        user.setStatus(AccountStatus.DEACTIVATED);
        service.deactivateUser("token", "student");
        user.setStatus(AccountStatus.DEACTIVATION_PENDING);
        assertThrows(ResponseStatusException.class, () -> service.deactivateUser("token", "student"));
        verify(lifecycle, times(2)).clearExpiredSuspension(eq("student"), any(Instant.class));
        verifyNoMoreInteractions(lifecycle);
        verifyNoInteractions(orders, firebase);
    }

    private void pending(User target, String operation) {
        target.setStatus(AccountStatus.DEACTIVATION_PENDING);
        ReflectionTestUtils.setField(target, "deletionOperationId", operation);
    }
}
