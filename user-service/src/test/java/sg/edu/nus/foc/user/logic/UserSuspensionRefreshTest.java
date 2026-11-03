/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-03
 * Mode: Code generation.
 * Scope: Generated the tests to check suspension refresh.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.logic;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.OutboxEventRepository;
import sg.edu.nus.foc.user.repository.UserRepository;
import tools.jackson.databind.json.JsonMapper;

class UserSuspensionRefreshTest {

    private final UserRepository repository = mock(UserRepository.class);
    private final FirebaseAuthService firebase = mock(FirebaseAuthService.class);
    private final OrderServiceClient orders = mock(OrderServiceClient.class);
    private final UserLifecycleStore lifecycle = mock(UserLifecycleStore.class);

    private final UserService service = new UserService(
            repository,
            firebase,
            orders,
            mock(OutboxEventRepository.class),
            JsonMapper.builder().build(),
            lifecycle
    );

    private User user;

    @BeforeEach
    void account() {
        user = new User();
        user.setUserId("student");
        user.setRoles(List.of("requester", "courier"));

        when(repository.findByUserId("student")).thenReturn(java.util.Optional.of(user));
    }

    @Test
    void fetchAllUsersRefreshesExpiredSuspensionsBeforeRetrievingUsers() {
        when(repository.findAll()).thenReturn(List.of(user));

        List<User> result = service.fetchAllUsers();

        assertEquals(1, result.size());

        InOrder sequence = inOrder(lifecycle, repository);
        sequence.verify(lifecycle).clearAllExpiredSuspensions(any(Instant.class));
        sequence.verify(repository).findAll();
    }
}