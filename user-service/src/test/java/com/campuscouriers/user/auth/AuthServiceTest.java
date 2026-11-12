/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Tool and date: Anthropic Claude (model unrecorded), 2026-10-09 to 2026-10-15
 * Scope (AI-24): Generated code, configuration and tests for the specified user event, Kafka setup and outbox changes.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.auth;

import com.campuscouriers.user.account.AccountCreationService;
import com.campuscouriers.user.auth.dto.LoginRequest;
import com.campuscouriers.user.entity.Account;
import com.campuscouriers.user.entity.Profile;
import com.campuscouriers.user.entity.AccountType;
import com.campuscouriers.user.event.UserEventPublisher;
import com.campuscouriers.user.event.UserRegisteredEvent;
import com.campuscouriers.user.exception.EmailAlreadyRegisteredException;
import com.campuscouriers.user.exception.InvalidCredentialsException;
import com.campuscouriers.user.repository.AccountRepository;
import com.campuscouriers.user.repository.ProfileRepository;
import com.campuscouriers.user.security.access.JwtService;
import com.campuscouriers.user.security.refresh.RefreshTokenService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.InOrder;
import org.mockito.Mock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.campuscouriers.user.auth.dto.RegisterRequest;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;

import static com.campuscouriers.user.TestConstants.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class AuthServiceTest {

    @Mock private AccountRepository accountRepository;
    @Mock private ProfileRepository profileRepository;
    @Mock private PasswordEncoder passwordEncoder;

    @Captor private ArgumentCaptor<Account> accountCaptor;
    @Captor private ArgumentCaptor<Profile> profileCaptor;

    @Mock private JwtService jwtService;
    @Mock private RefreshTokenService refreshTokenService;

    @Mock private UserEventPublisher userEventPublisher;
    @Captor private ArgumentCaptor<UserRegisteredEvent> eventCaptor;

    private static final Instant NOW = Instant.parse("2026-01-01T00:00:00Z");
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);

    private AuthService authService;

    // Real AccountCreationService over the mocks, so registration is tested through the shared creation path
    @BeforeEach
    void setUp() {
        AccountCreationService accountCreationService =
                new AccountCreationService(accountRepository, profileRepository, passwordEncoder);
        authService = new AuthService(accountRepository, accountCreationService, passwordEncoder,
                jwtService, refreshTokenService, userEventPublisher, clock);
    }

    private final RegisterRequest request =
            new RegisterRequest(VALID_NAME, VALID_EMAIL, VALID_PASSWORD);

    @DisplayName("F1.1.2 - Email shall not be allowed if there is an existing registration with the same email")
    @Nested
    class EmailDuplicateTests {

        @Test
        void register_whenEmailAlreadyRegistered_throwsAndSavesNothing() {
            when(accountRepository.existsByEmail(VALID_EMAIL)).thenReturn(true);

            assertThatThrownBy(() -> authService.register(request))
                    .isInstanceOf(EmailAlreadyRegisteredException.class);

            verify(accountRepository, never()).save(any());
            verifyNoInteractions(profileRepository, passwordEncoder, userEventPublisher);
        }

        @Test
        void register_storesEmailInLowerCase() {
            authService.register(new RegisterRequest(VALID_NAME, DUPLICATE_EMAIL, VALID_PASSWORD));

            verify(accountRepository).save(accountCaptor.capture());
            assertThat(accountCaptor.getValue().getEmail()).isEqualTo(VALID_EMAIL);
        }

        @Test
        void register_treatsEmailCaseInsensitively() {
            when(accountRepository.existsByEmail(VALID_EMAIL)).thenReturn(true);

            assertThatThrownBy(() ->
                authService.register(new RegisterRequest(VALID_NAME, DUPLICATE_EMAIL, VALID_PASSWORD)))
                .isInstanceOf(EmailAlreadyRegisteredException.class);
        }
    }

    @DisplayName("F1.3.2 - the service should always assign Student type; administrators come from the bootstrap")
    @Nested
    class AccountTypeTests {
        @Test
        void register_savesUserAsStudent() {

            authService.register(request);

            verify(accountRepository).save(accountCaptor.capture());
            assertThat(accountCaptor.getValue().getType()).isEqualTo(AccountType.Student);

        }

        @Test
        void register_neverGrantsAdministrator_evenWhenNoAccountsExist() {

            authService.register(request);

            verify(accountRepository).save(accountCaptor.capture());
            assertThat(accountCaptor.getValue().getType()).isEqualTo(AccountType.Student);
            verify(accountRepository, never()).count();
            verify(accountRepository, never()).existsByType(any());

        }
    }

    @Test
    void register_savesAccountWithHashedPassword() {

        when(passwordEncoder.encode(VALID_PASSWORD)).thenReturn("hashed-password");

        authService.register(request);

        verify(accountRepository).save(accountCaptor.capture());
        Account saved = accountCaptor.getValue();
        assertThat(saved.getEmail()).isEqualTo(VALID_EMAIL);
        assertThat(saved.getPasswordHash()).isEqualTo("hashed-password");

    }

    @DisplayName("F1.3 - the service should create a profile for the user (linked to the account)")
    @Test
    void register_createProfileLinkedToNewAccount() {

        authService.register(request);

        verify(accountRepository).save(accountCaptor.capture());
        verify(profileRepository).save(profileCaptor.capture());

        Profile profile = profileCaptor.getValue();
        assertThat(profile.getName()).isEqualTo(VALID_NAME);
        assertThat(profile.getAccount()).isSameAs(accountCaptor.getValue());

    }

    @DisplayName("Registration publishes a UserRegisteredEvent for other services")
    @Nested
    class RegistrationEventTests {

        @Test
        void register_publishesEventWithAccountAndProfileDetails() {

            authService.register(new RegisterRequest(VALID_NAME, DUPLICATE_EMAIL, VALID_PASSWORD));

            verify(accountRepository).save(accountCaptor.capture());
            verify(userEventPublisher).publishUserRegistered(eventCaptor.capture());

            UserRegisteredEvent event = eventCaptor.getValue();
            assertThat(event.userId()).isEqualTo(accountCaptor.getValue().getId());
            assertThat(event.type()).isEqualTo(AccountType.Student);
            assertThat(event.name()).isEqualTo(VALID_NAME);
            assertThat(event.email()).isEqualTo(VALID_EMAIL);  // normalised, as persisted
            assertThat(event.registeredAt()).isEqualTo(NOW);

        }

        @Test
        void register_publishesOnlyAfterAccountAndProfileAreSaved() {

            authService.register(request);

            InOrder inOrder = inOrder(accountRepository, profileRepository, userEventPublisher);
            inOrder.verify(accountRepository).save(any());
            inOrder.verify(profileRepository).save(any());
            inOrder.verify(userEventPublisher).publishUserRegistered(any());

        }

        @Test
        void register_whenProfileSaveFails_publishesNothing() {
            when(profileRepository.save(any())).thenThrow(new RuntimeException("database down"));

            assertThatThrownBy(() -> authService.register(request)).isInstanceOf(RuntimeException.class);

            verifyNoInteractions(userEventPublisher);
        }
    }

    @DisplayName("F2.1 - the user service should verify that the user for the email exists")
    @Test
    void login_withUnknownEmail_throwsAndStillHashesThePassword() {

        when(accountRepository.findByEmail("nobody@u.nus.edu")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(new LoginRequest("nobody@u.nus.edu", "whatever")))
                .isInstanceOf(InvalidCredentialsException.class);

        verify(passwordEncoder).encode("whatever");

    }

    @DisplayName("F2.2 - the user service shall verify the submitted password hash against the stored password hash")
    @Test
    void login_withWrongPassword_throwsTheSameGenericError() {
        Account account = new Account(AccountType.Student, VALID_EMAIL, "hashed");
        when(accountRepository.findByEmail(VALID_EMAIL)).thenReturn(Optional.of(account));
        when(passwordEncoder.matches("wrong-password", "hashed")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(new LoginRequest(VALID_EMAIL, "wrong-password")))
                .isInstanceOf(InvalidCredentialsException.class);
    }

    // F2.2.1 is implicitly fulfilled through BCryptPasswordEncoder.matches() comparing in constant time
    // BCrypt.checkpw checks every byte instead of stopping at the first difference

    // F2.2.2 is implicitly fulfilled through the use of InvalidCredentialsException.java

    @DisplayName("F2.3 - the user service shall issue a full session upon successful verification")
    @Test
    void login_withCorrectCredentials_returnsAccessAndRefreshTokens() {
        Account account = new Account(AccountType.Student, VALID_EMAIL, "hashed");
        when(accountRepository.findByEmail(VALID_EMAIL)).thenReturn(Optional.of(account));
        when(passwordEncoder.matches(VALID_PASSWORD, "hashed")).thenReturn(true);
        when(jwtService.generateAccessToken(account)).thenReturn("signed.jwt.token");
        when(jwtService.getAccessTokenTtl()).thenReturn(Duration.ofMinutes(15));
        when(refreshTokenService.issue(account)).thenReturn("raw-refresh-token");

        AuthTokens tokens = authService.login(new LoginRequest(VALID_EMAIL, VALID_PASSWORD));

        assertThat(tokens.accessToken()).isEqualTo("signed.jwt.token");
        assertThat(tokens.refreshToken()).isEqualTo("raw-refresh-token");
        assertThat(tokens.expiresIn()).isEqualTo(900L);
    }

    @DisplayName("F4 - the user service shall allow users to refresh their tokens")
    @Test
    void refresh_withAValidToken_returnsNewTokens() {
        Account account = new Account(AccountType.Student, VALID_EMAIL, "hashed");
        when(refreshTokenService.redeem("old-refresh-token")).thenReturn(account);
        when(jwtService.generateAccessToken(account)).thenReturn("new-access-token");
        when(jwtService.getAccessTokenTtl()).thenReturn(Duration.ofMinutes(15));
        when(refreshTokenService.issue(account)).thenReturn("new-refresh-token");

        AuthTokens tokens = authService.refresh("old-refresh-token");

        assertThat(tokens.accessToken()).isEqualTo("new-access-token");
        assertThat(tokens.refreshToken()).isEqualTo("new-refresh-token");
    }   // Uses redemption from the RefreshTokenService

    @DisplayName("F22 - logout shall revoke the refresh token for the authenticated account")
    @Test
    void logout_revokesTheRefreshTokenForTheAuthenticatedAccount() {
        UUID accountId = UUID.randomUUID();

        authService.logout(accountId, "raw-refresh-token");

        verify(refreshTokenService).revoke("raw-refresh-token", accountId);
        verifyNoInteractions(jwtService, accountRepository);
    }

}
