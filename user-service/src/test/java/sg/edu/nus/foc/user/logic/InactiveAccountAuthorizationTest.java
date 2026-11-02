package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;
import tools.jackson.databind.json.JsonMapper;

class InactiveAccountAuthorizationTest {
    private final UserRepository repository = mock(UserRepository.class);
    private final UserLifecycleStore lifecycle = mock(UserLifecycleStore.class);
    private final UserService service = new UserService(repository, mock(FirebaseAuthService.class),
            mock(OrderServiceClient.class), mock(OutboxEventRepository.class), JsonMapper.builder().build(), lifecycle);

    @BeforeEach
    void setUp() {
        when(lifecycle.saveActive(any(User.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void onlyActiveAccountsExposeTheirStoredRoles() {
        User user = user(List.of("requester", "courier", "admin"));
        for (AccountStatus status : AccountStatus.values()) {
            user.setStatus(status);
            assertEquals(status == AccountStatus.ACTIVE ? user.getRoles() : List.of(),
                    service.getRoleContext("student").getRoles(), status.toString());
        }
        user.setStatus(null);
        assertTrue(service.getRoleContext("student").getRoles().isEmpty());
        assertEquals(List.of("requester", "courier", "admin"), user.getRoles(), "Retain historical roles");
    }

    @Test
    void eligibilityRequiresActualRoleAndActiveAccount() {
        User user = user(List.of("requester", "courier", "admin"));
        assertTrue(service.verifyRequester(user));
        assertTrue(service.verifyCourier(user));
        assertTrue(service.verifyAdmin(user));
        for (AccountStatus status : List.of(AccountStatus.DEACTIVATION_PENDING, AccountStatus.DEACTIVATED)) {
            user.setStatus(status);
            assertFalse(service.verifyRequester("student"));
            assertFalse(service.verifyCourier("student"));
            assertFalse(service.verifyAdmin("student"));
        }
        user.setStatus(AccountStatus.ACTIVE);
        user.setRoles(null);
        assertFalse(service.verifyRequester(user));
        assertFalse(service.verifyCourier(user));
        assertFalse(service.verifyAdmin(user));
        user.setRoles(List.of());
        assertFalse(service.verifyRequester(user));
        assertFalse(service.verifyCourier(user));
        assertFalse(service.verifyAdmin(user));
    }

    private User user(List<String> roles) {
        User user = new User();
        user.setUserId("student");
        user.setRoles(roles);
        when(repository.findByUserId("student")).thenReturn(Optional.of(user));
        return user;
    }
}
