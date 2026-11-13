package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.friendoncampus.user.config.AdminBootstrapProperties;
import com.friendoncampus.user.config.MailProperties;
import com.friendoncampus.user.domain.AdminBootstrapState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminBootstrapStateRepository;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class AdminBootstrapServiceTest {
    @Mock AdminBootstrapStateRepository states;
    @Mock UserRepository users;
    @Mock PasswordEncoder passwords;
    @Mock EmailVerificationService verifications;

    private AdminBootstrapState state;
    private AdminBootstrapService service;

    @BeforeEach
    void setUp() {
        state = AdminBootstrapState.firstAdmin();
        service = service(new AdminBootstrapProperties("admin@u.nus.edu", "First Admin", "password-with-at-least-15-chars"));
    }

    @Test
    void doesNothingWhenNoBootstrapSecretIsConfigured() {
        service(new AdminBootstrapProperties("", "", "")).bootstrap();

        verifyNoInteractions(states, users, passwords, verifications);
    }

    @Test
    void createsAnUnverifiedAdminAndSendsTheExistingVerificationCode() {
        lockState();
        when(users.findFirstByRolesContaining(UserRole.ADMIN)).thenReturn(Optional.empty());
        when(users.findByEmail("admin@u.nus.edu")).thenReturn(Optional.empty());
        when(users.findByUsernameNormalized("first admin")).thenReturn(Optional.empty());
        when(passwords.encode(anyString())).thenReturn("hash");
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        service.bootstrap();

        ArgumentCaptor<User> created = ArgumentCaptor.forClass(User.class);
        verify(users).save(created.capture());
        assertThat(created.getValue().getRoles()).containsExactlyInAnyOrder(UserRole.REQUESTER, UserRole.ADMIN);
        assertThat(created.getValue().getStatus()).isEqualTo(UserStatus.UNVERIFIED);
        verify(verifications).issueInitial(created.getValue());
        assertThat(state.isCompleted()).isTrue();
        verify(states).save(state);
    }

    @Test
    void promotesTheConfiguredExistingUserAndVerifiesItWhenStillUnverified() {
        lockState();
        when(users.findFirstByRolesContaining(UserRole.ADMIN)).thenReturn(Optional.empty());
        User existing = User.register("admin@u.nus.edu", "First Admin", "first admin", "existing-hash");
        when(users.findByEmail("admin@u.nus.edu")).thenReturn(Optional.of(existing));
        when(users.findByUsernameNormalized("first admin")).thenReturn(Optional.of(existing));

        service.bootstrap();

        assertThat(existing.getRoles()).containsExactlyInAnyOrder(UserRole.REQUESTER, UserRole.ADMIN);
        verify(users).save(existing);
        verify(verifications).issueInitial(existing);
        verifyNoInteractions(passwords);
    }

    @Test
    void completedStateMakesRepeatStartupACompleteNoOp() {
        lockState();
        state.complete(java.util.UUID.randomUUID(), java.time.OffsetDateTime.now(ZoneOffset.UTC));

        service.bootstrap();

        verify(states, never()).save(any());
        verifyNoInteractions(users, passwords, verifications);
    }

    @Test
    void recordsCompletionWithoutCreatingAnotherAccountWhenAnAdminAlreadyExists() {
        lockState();
        User existingAdmin = User.bootstrapAdmin("other@u.nus.edu", "Other", "other", "hash");
        when(users.findFirstByRolesContaining(UserRole.ADMIN)).thenReturn(Optional.of(existingAdmin));

        service.bootstrap();

        assertThat(state.isCompleted()).isTrue();
        verify(states).save(state);
        verifyNoMoreInteractions(passwords, verifications);
    }

    @Test
    void failsWithoutACompleteSecretOrSendGridDeliveryConfiguration() {
        assertThatThrownBy(() -> service(new AdminBootstrapProperties("admin@u.nus.edu", "", "password-with-at-least-15-chars")).bootstrap())
                .hasMessageContaining("must be set together");
        lockState();
        when(users.findFirstByRolesContaining(UserRole.ADMIN)).thenReturn(Optional.empty());
        AdminBootstrapService noMailer = new AdminBootstrapService(
                new AdminBootstrapProperties("admin@u.nus.edu", "First Admin", "password-with-at-least-15-chars"), states,
                users, passwords, verifications, new MailProperties("noop", "", ""), Clock.systemUTC());
        assertThatThrownBy(noMailer::bootstrap).hasMessageContaining("MAIL_PROVIDER=sendgrid");
    }

    @Test
    void propagatesDeliveryFailureSoTheApplicationStartupFails() {
        lockState();
        when(users.findFirstByRolesContaining(UserRole.ADMIN)).thenReturn(Optional.empty());
        when(users.findByEmail("admin@u.nus.edu")).thenReturn(Optional.empty());
        when(users.findByUsernameNormalized("first admin")).thenReturn(Optional.empty());
        when(passwords.encode(anyString())).thenReturn("hash");
        when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        doThrow(new EmailVerificationDeliveryException(new IllegalStateException("mail unavailable"))).when(verifications).issueInitial(any());

        assertThatThrownBy(service::bootstrap).isInstanceOf(EmailVerificationDeliveryException.class);
        verify(states, never()).save(any());
    }

    private AdminBootstrapService service(AdminBootstrapProperties properties) {
        return new AdminBootstrapService(properties, states, users, passwords, verifications,
                new MailProperties("sendgrid", "test-key", "noreply@example.com"),
                Clock.fixed(Instant.parse("2030-01-01T00:00:00Z"), ZoneOffset.UTC));
    }

    private void lockState() {
        when(states.findByIdForUpdate(AdminBootstrapState.FIRST_ADMIN)).thenReturn(Optional.of(state));
    }
}
