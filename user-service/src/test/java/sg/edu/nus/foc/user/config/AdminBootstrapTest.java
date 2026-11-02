package sg.edu.nus.foc.user.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.Optional;

import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthException;
import com.google.firebase.auth.UserRecord;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.logic.UserService;
import sg.edu.nus.foc.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private UserService userService;

    @Mock
    private FirebaseAuth firebaseAuth;

    @Mock
    private UserRecord firebaseUser;

    @InjectMocks
    private AdminBootstrap adminBootstrap;

    private static final String ADMIN_EMAIL = "admin@example.com";
    private static final String ADMIN_UID = "firebase-admin-uid";

    @BeforeEach
    void setUp() {
        // Simulate Spring's @Value injection.
        ReflectionTestUtils.setField(adminBootstrap, "enabled", true);
        ReflectionTestUtils.setField(adminBootstrap, "bootstrapEmail", ADMIN_EMAIL);
    }

    @Test
    void doesNothingWhenBootstrapIsDisabled() {
        ReflectionTestUtils.setField(adminBootstrap, "enabled", false);

        adminBootstrap.run();

        verifyNoInteractions(userRepository, userService, firebaseAuth);
    }

    @Test
    void skipsBootstrapWhenAdminAlreadyExists() {
        // The method only checks whether the Optional is present.
        doReturn(Optional.of(new User()))
                .when(userRepository)
                .findFirstByRolesContaining("admin");

        adminBootstrap.run();

        verify(userRepository).findFirstByRolesContaining("admin");
        verifyNoInteractions(userService, firebaseAuth);
    }

    @Test
    void throwsExceptionWhenBootstrapEmailIsMissing() {
        ReflectionTestUtils.setField(adminBootstrap, "bootstrapEmail", " ");

        when(userRepository.findFirstByRolesContaining("admin"))
                .thenReturn(Optional.empty());

        IllegalStateException exception = assertThrows(
                IllegalStateException.class,
                () -> adminBootstrap.run()
        );

        assertEquals(
                "Admin bootstrap is enabled but no email was configured.",
                exception.getMessage()
        );

        verifyNoInteractions(firebaseAuth, userService);
    }

    @Test
    void createsAdminWhenFirebaseUserIsFound() throws Exception {
        when(userRepository.findFirstByRolesContaining("admin"))
                .thenReturn(Optional.empty());

        when(firebaseAuth.getUserByEmail(ADMIN_EMAIL))
                .thenReturn(firebaseUser);

        when(firebaseUser.getUid()).thenReturn(ADMIN_UID);
        when(firebaseUser.getEmail()).thenReturn(ADMIN_EMAIL);

        adminBootstrap.run();

        verify(firebaseAuth).getUserByEmail(ADMIN_EMAIL);
        verify(userService).addAdmin(ADMIN_UID, ADMIN_EMAIL);
    }

    @Test
    void throwsRuntimeExceptionWhenFirebaseUserCannotBeFound() throws Exception {
        when(userRepository.findFirstByRolesContaining("admin"))
                .thenReturn(Optional.empty());

        FirebaseAuthException firebaseException = mock(FirebaseAuthException.class);

        when(firebaseAuth.getUserByEmail(ADMIN_EMAIL))
                .thenThrow(firebaseException);

        RuntimeException exception = assertThrows(
                RuntimeException.class,
                () -> adminBootstrap.run()
        );

        assertEquals(
                "Could not find bootstrap admin in Firebase: " + ADMIN_EMAIL,
                exception.getMessage()
        );

        assertSame(firebaseException, exception.getCause());

        verify(userService, never()).addAdmin(anyString(), anyString());
    }
}