package com.cs3219.foc.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import com.cs3219.foc.user.config.AccountMailProperties;
import com.cs3219.foc.user.config.AuthProperties;
import com.cs3219.foc.user.exception.EmailVerificationException;
import com.cs3219.foc.user.exception.EntityAlreadyExistsException;
import com.cs3219.foc.user.exception.InvalidEmailTokenException;
import com.cs3219.foc.user.exception.InvalidPasswordException;
import com.cs3219.foc.user.exception.InvalidPasswordResetTokenException;
import com.cs3219.foc.user.exception.InvalidRefreshTokenException;
import com.cs3219.foc.user.infrastructure.mail.AccountMailListener;
import com.cs3219.foc.user.integration.AbstractIntegrationTest;
import com.cs3219.foc.user.model.dto.ChangePasswordRequest;
import com.cs3219.foc.user.model.dto.LoginRequest;
import com.cs3219.foc.user.model.dto.RegisterUserRequest;
import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UpdateUserRequest;
import com.cs3219.foc.user.model.dto.UserSearchCriteria;
import com.cs3219.foc.user.model.entity.User;
import com.cs3219.foc.user.model.entity.UserRole;
import com.cs3219.foc.user.repository.EmailTokenRepository;
import com.cs3219.foc.user.repository.RefreshTokenRepository;
import com.cs3219.foc.user.repository.UserRepository;
import com.cs3219.foc.user.security.AuthenticatedUserResolver;
import com.cs3219.foc.user.security.AuthenticationContextService;
import com.cs3219.foc.user.security.CurrentUserService;
import com.cs3219.foc.user.security.CustomUserDetailsService;
import com.cs3219.foc.user.support.TestMappers;
import java.net.URI;
import java.sql.DriverManager;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.http.HttpStatus;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** Runs the real migrations and service transactions in a disposable PostgreSQL database. */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@Import(UserProfilePersistenceTests.TestConfig.class)
class UserProfilePersistenceTests extends AbstractIntegrationTest {

    @Autowired
    private PostgreSQLContainer postgres;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private UserRepository repository;

    @Autowired
    private UserService service;

    @Autowired
    private PasswordService passwordService;

    @Autowired
    private AuthService authService;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private EmailVerificationService verification;

    @Autowired
    private EmailChangeService emailChangeService;

    @Autowired
    private EmailTokenRepository emailTokenRepository;

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private ThreadPoolTaskExecutor taskExecutor;

    @AfterEach
    void finishMailTasks() throws Exception {
        // Drain the single test worker before the next test resets the mail mock.
        taskExecutor.submit(() -> {}).get(10, TimeUnit.SECONDS);
    }

    @BeforeEach
    void cleanUsers() throws Exception {
        reset(mailSender);
        repository.deleteAll();
    }

    private User createUser(String email) {
        return repository.saveAndFlush(User.builder()
                .name("Alex Tan")
                .email(email)
                .roles(List.of(UserRole.USER))
                .passwordHash("unchanged-hash")
                .build());
    }

    private User createPasswordUser(String email) {
        var user = createUser(email);
        user.setPasswordHash(passwordEncoder.encode("CurrentPassword1"));
        user.setEmailVerified(true);
        return repository.saveAndFlush(user);
    }

    @Test
    void provisionsVerifiedAdminWithoutVerificationMailAndPreservesItOnRerun() {
        assertThat(service.initializeAdmin(new RegisterUserRequest(" ADMIN@U.NUS.EDU ", " Admin ", " password123 ")))
                .isTrue();

        var admin = repository.findByEmail("admin@u.nus.edu").orElseThrow();
        assertThat(admin.getName()).isEqualTo("Admin");
        assertThat(admin.getRoles()).containsExactly(UserRole.USER, UserRole.ADMIN);
        assertThat(admin.isEmailVerified()).isTrue();
        assertThat(passwordEncoder.matches(" password123 ", admin.getPasswordHash()))
                .isTrue();
        assertThat(authService.login(new LoginRequest("admin@u.nus.edu", " password123 ")))
                .isNotNull();
        assertThat(emailTokenRepository.count()).isZero();
        verifyNoInteractions(mailSender);

        assertThat(service.initializeAdmin(new RegisterUserRequest("admin@u.nus.edu", "Changed", "replacement123")))
                .isFalse();

        var unchanged = repository.findByEmail("admin@u.nus.edu").orElseThrow();
        assertThat(unchanged.getId()).isEqualTo(admin.getId());
        assertThat(unchanged.getPasswordHash()).isEqualTo(admin.getPasswordHash());
        assertThat(unchanged.getName()).isEqualTo(admin.getName());
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    void provisioningNeverPromotesOrResetsAnExistingUser() {
        var user = createPasswordUser("admin@u.nus.edu");

        assertThatThrownBy(
                        () -> service.initializeAdmin(new RegisterUserRequest(user.getEmail(), "Admin", "password123")))
                .isInstanceOf(EntityAlreadyExistsException.class);

        var unchanged = repository.findById(user.getId()).orElseThrow();
        assertThat(unchanged.getRoles()).containsExactly(UserRole.USER);
        assertThat(unchanged.getPasswordHash()).isEqualTo(user.getPasswordHash());
        verifyNoInteractions(mailSender);
    }

    @Test
    void registrationSendsACommittedSingleUseLinkAndRequiresVerificationBeforeLogin() throws Exception {
        var sending = new CountDownLatch(1);
        var releaseMail = new CountDownLatch(1);
        doAnswer(invocation -> {
                    sending.countDown();
                    assertThat(releaseMail.await(10, TimeUnit.SECONDS)).isTrue();
                    return null;
                })
                .when(mailSender)
                .send(any(SimpleMailMessage.class));
        try (var executor = Executors.newSingleThreadExecutor()) {
            var registration = executor.submit(
                    () -> service.registerUser(new RegisterUserRequest("jamie@u.nus.edu", "Jamie", "password123")));
            try {
                assertThat(sending.await(10, TimeUnit.SECONDS)).isTrue();
                // Registration returns and the account is committed while SMTP is still waiting.
                var registered = registration.get(5, TimeUnit.SECONDS);
                assertThat(repository.findById(UUID.fromString(registered.id())))
                        .isPresent();
            } finally {
                releaseMail.countDown();
            }
        }
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000)).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly("jamie@u.nus.edu");
        var link = message.getValue()
                .getText()
                .lines()
                .filter(line -> line.startsWith("http://localhost:3000/verify-email?token="))
                .findFirst()
                .orElseThrow();
        var token = URI.create(link).getQuery().substring("token=".length());
        var credentials = new LoginRequest("jamie@u.nus.edu", "password123");
        assertThatThrownBy(() -> authService.login(credentials))
                .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                        .isEqualTo(HttpStatus.FORBIDDEN));
        assertThat(refreshTokenRepository.count()).isZero();

        verification.verifyEmail(token);

        assertThat(repository.findByEmail("jamie@u.nus.edu").orElseThrow().isEmailVerified())
                .isTrue();
        assertThat(emailTokenRepository.count()).isZero();
        assertThat(authService.login(credentials).accessToken()).isNotBlank();
        assertThatThrownBy(() -> verification.verifyEmail(token)).isInstanceOf(InvalidEmailTokenException.class);
    }

    @Test
    void emailChangeVerifiesTheNewAddressAndKeepsTheExistingSession() {
        var user = createPasswordUser("original@u.nus.edu");
        var session = authService.login(new LoginRequest(user.getEmail(), "CurrentPassword1"));
        emailChangeService.requestChange(user.getId(), "updated@nus.edu.sg");
        var token = capturedEmailChangeToken("updated@nus.edu.sg");
        assertThat(repository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo("original@u.nus.edu");
        assertThat(emailTokenRepository.findAll()).singleElement().satisfies(stored -> assertThat(stored.getEmail())
                .isEqualTo("updated@nus.edu.sg"));

        assertThatThrownBy(() -> verification.verifyEmail(token)).isInstanceOf(InvalidEmailTokenException.class);
        emailChangeService.confirmChange(token);
        var messages = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000).times(2)).send(messages.capture());
        var notification = messages.getAllValues().get(1);
        assertThat(notification.getTo()).containsExactly("original@u.nus.edu");
        assertThat(notification.getSubject()).isEqualTo("Your FoC email address has changed");
        assertThat(notification.getText()).contains("updated@nus.edu.sg");

        var updated = repository.findById(user.getId()).orElseThrow();
        assertThat(updated.getEmail()).isEqualTo("updated@nus.edu.sg");
        assertThat(updated.isEmailVerified()).isTrue();
        assertThat(emailTokenRepository.count()).isZero();
        assertThat(authService.refreshAccessToken(session.refreshToken()).accessToken())
                .isNotBlank();
        assertThat(authService
                        .login(new LoginRequest("updated@nus.edu.sg", "CurrentPassword1"))
                        .accessToken())
                .isNotBlank();
        assertThatThrownBy(() -> authService.login(new LoginRequest("original@u.nus.edu", "CurrentPassword1")))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void emailChangeRejectsAnAddressClaimedBeforeRequestOrBeforeConfirmation() {
        var user = createPasswordUser("original@u.nus.edu");
        createUser("taken@nus.edu.sg");
        assertThatThrownBy(() -> emailChangeService.requestChange(user.getId(), "taken@nus.edu.sg"))
                .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
        verifyNoInteractions(mailSender);

        emailChangeService.requestChange(user.getId(), "available@nus.edu.sg");
        var token = capturedEmailChangeToken("available@nus.edu.sg");
        createUser("available@nus.edu.sg");
        assertThatThrownBy(() -> emailChangeService.confirmChange(token))
                .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                        .isEqualTo(HttpStatus.CONFLICT));
        assertThat(repository.findById(user.getId()).orElseThrow().getEmail()).isEqualTo("original@u.nus.edu");
        assertThat(emailTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void passwordResetVerifiesEmailNotifiesOwnerAndRevokesExistingCredentials() {
        var user = createPasswordUser("reset@u.nus.edu");
        var session = authService.login(new LoginRequest(user.getEmail(), "CurrentPassword1"));
        user.setEmailVerified(false);
        repository.saveAndFlush(user);
        passwordService.requestPasswordReset(user.getEmail());
        var originalTokenHash = emailTokenRepository.findAll().getFirst().getTokenHash();
        passwordService.requestPasswordReset(user.getEmail());
        passwordService.requestPasswordReset("missing@u.nus.edu");
        assertThat(emailTokenRepository.findAll()).singleElement().satisfies(stored -> assertThat(stored.getTokenHash())
                .isEqualTo(originalTokenHash));
        // The repeated request succeeds without replacing the link or sending another email.
        var token = capturedPasswordResetToken(user.getEmail());
        reset(mailSender);
        emailChangeService.requestChange(user.getId(), "pending@nus.edu.sg");
        var changeToken = capturedEmailChangeToken("pending@nus.edu.sg");
        assertThat(passwordEncoder.matches(
                        "CurrentPassword1",
                        repository.findById(user.getId()).orElseThrow().getPasswordHash()))
                .isTrue();

        passwordService.resetPassword(token, " NewPassword2 ");
        assertThat(repository.findById(user.getId()).orElseThrow().isEmailVerified())
                .isTrue();
        var messages = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000).times(2)).send(messages.capture());
        var notice = messages.getAllValues().get(1);
        assertThat(notice.getTo()).containsExactly(user.getEmail());
        assertThat(notice.getSubject()).isEqualTo("Your FoC password has been reset");
        assertThat(notice.getText()).doesNotContain("NewPassword2", "reset-password?token=");

        assertThatThrownBy(() -> emailChangeService.confirmChange(changeToken))
                .isInstanceOf(InvalidEmailTokenException.class);

        assertThat(authService
                        .login(new LoginRequest(user.getEmail(), " NewPassword2 "))
                        .accessToken())
                .isNotBlank();
        assertThatThrownBy(() -> authService.login(new LoginRequest(user.getEmail(), "CurrentPassword1")))
                .isInstanceOf(BadCredentialsException.class);
        assertThatThrownBy(() -> authService.refreshAccessToken(session.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> passwordService.resetPassword(token, "AnotherPassword3"))
                .isInstanceOf(InvalidPasswordResetTokenException.class);
    }

    @Test
    void changingEmailInvalidatesAPasswordResetLinkSentToTheOldAddress() {
        var user = createPasswordUser("original@u.nus.edu");
        passwordService.requestPasswordReset(user.getEmail());
        var resetToken = capturedPasswordResetToken(user.getEmail());
        reset(mailSender);
        emailChangeService.requestChange(user.getId(), "updated@nus.edu.sg");
        emailChangeService.confirmChange(capturedEmailChangeToken("updated@nus.edu.sg"));

        assertThatThrownBy(() -> passwordService.resetPassword(resetToken, "NewPassword2"))
                .isInstanceOf(InvalidPasswordResetTokenException.class);
        assertThat(authService
                        .login(new LoginRequest("updated@nus.edu.sg", "CurrentPassword1"))
                        .accessToken())
                .isNotBlank();
        // A failed reset rolls back token consumption along with the password update.
        assertThat(emailTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void profilePasswordChangeRevokesPendingResetAndEmailChangeLinks() {
        var user = createPasswordUser("original@u.nus.edu");
        passwordService.requestPasswordReset(user.getEmail());
        var resetToken = capturedPasswordResetToken(user.getEmail());
        reset(mailSender);
        emailChangeService.requestChange(user.getId(), "pending@nus.edu.sg");
        var changeToken = capturedEmailChangeToken("pending@nus.edu.sg");

        passwordService.changePassword(user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));

        assertThatThrownBy(() -> passwordService.resetPassword(resetToken, "AnotherPassword3"))
                .isInstanceOf(InvalidPasswordResetTokenException.class);
        assertThatThrownBy(() -> emailChangeService.confirmChange(changeToken))
                .isInstanceOf(InvalidEmailTokenException.class);
        assertThat(authService
                        .login(new LoginRequest(user.getEmail(), "NewPassword2"))
                        .accessToken())
                .isNotBlank();
    }

    private String capturedPasswordResetToken(String address) {
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000)).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly(address);
        var link = message.getValue()
                .getText()
                .lines()
                .filter(line -> line.startsWith("http://localhost:3000/reset-password?token="))
                .findFirst()
                .orElseThrow();
        return UriComponentsBuilder.fromUriString(link).build().getQueryParams().getFirst("token");
    }

    private String capturedEmailChangeToken(String address) {
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000)).send(message.capture());
        assertThat(message.getValue().getTo()).containsExactly(address);
        var link = message.getValue()
                .getText()
                .lines()
                .filter(line -> line.startsWith("http://localhost:3000/verify-email?"))
                .findFirst()
                .orElseThrow();
        assertThat(link).contains("purpose=email-change");
        return UriComponentsBuilder.fromUriString(link).build().getQueryParams().getFirst("token");
    }

    @Test
    void adminEmailChangeRequiresConfirmationAndInvalidatesTheOldRegistrationLink() {
        var registered = service.registerUser(new RegisterUserRequest("original@u.nus.edu", "Jamie", "password123"));
        var message = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000)).send(message.capture());
        var link = message.getValue()
                .getText()
                .lines()
                .filter(line -> line.startsWith("http://localhost:3000/verify-email?token="))
                .findFirst()
                .orElseThrow();
        var token = URI.create(link).getQuery().substring("token=".length());
        service.updateUser(
                UUID.fromString(registered.id()),
                new UpdateUserRequest("Updated Jamie", "changed@u.nus.edu", List.of(UserRole.USER), null, null));
        var pending = repository.findById(UUID.fromString(registered.id())).orElseThrow();
        assertThat(pending.getEmail()).isEqualTo("original@u.nus.edu");
        assertThat(pending.getName()).isEqualTo("Updated Jamie");
        assertThat(pending.isEmailVerified()).isFalse();
        var messages = ArgumentCaptor.forClass(SimpleMailMessage.class);
        verify(mailSender, timeout(5000).times(2)).send(messages.capture());
        var changeMail = messages.getAllValues().get(1);
        assertThat(changeMail.getTo()).containsExactly("changed@u.nus.edu");
        var changeLink = changeMail
                .getText()
                .lines()
                .filter(line -> line.startsWith("http://localhost:3000/verify-email?"))
                .findFirst()
                .orElseThrow();
        emailChangeService.confirmChange(UriComponentsBuilder.fromUriString(changeLink)
                .build()
                .getQueryParams()
                .getFirst("token"));
        assertThat(repository
                        .findById(UUID.fromString(registered.id()))
                        .orElseThrow()
                        .getEmail())
                .isEqualTo("changed@u.nus.edu");

        assertThatThrownBy(() -> verification.verifyEmail(token))
                .isInstanceOfSatisfying(EmailVerificationException.class, error -> assertThat(error.getStatus())
                        .isEqualTo(HttpStatus.BAD_REQUEST));
        assertThat(repository
                        .findById(UUID.fromString(registered.id()))
                        .orElseThrow()
                        .isEmailVerified())
                .isTrue();
    }

    @Test
    void registrationRollbackDoesNotSendMail() {
        assertThatThrownBy(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                    service.registerUser(new RegisterUserRequest("rollback@u.nus.edu", "Jamie", "password123"));
                    throw new IllegalStateException("rollback");
                }))
                .isInstanceOf(IllegalStateException.class);
        assertThat(repository.findByEmail("rollback@u.nus.edu")).isEmpty();
        assertThat(emailTokenRepository.count()).isZero();
        verifyNoInteractions(mailSender);
    }

    @Test
    void deliveryFailureDoesNotRollbackTheRegisteredAccount() {
        doThrow(new MailSendException("SMTP unavailable")).when(mailSender).send(any(SimpleMailMessage.class));
        service.registerUser(new RegisterUserRequest("delivery@u.nus.edu", "Jamie", "password123"));
        verify(mailSender, timeout(5000)).send(any(SimpleMailMessage.class));
        assertThat(repository.findByEmail("delivery@u.nus.edu")).isPresent();
        assertThat(emailTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void passwordChangeRequiresNewLoginAndRevokesAllOfOnlyThisUsersSessions() {
        var user = createPasswordUser("password@example.com");
        createPasswordUser("other@example.com");
        var first = authService.login(new LoginRequest("password@example.com", "CurrentPassword1"));
        var second = authService.login(new LoginRequest("password@example.com", "CurrentPassword1"));
        var other = authService.login(new LoginRequest("other@example.com", "CurrentPassword1"));
        passwordService.changePassword(user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
        assertThatThrownBy(() -> authService.login(new LoginRequest("password@example.com", "CurrentPassword1")))
                .isInstanceOf(BadCredentialsException.class);
        assertThat(authService
                        .login(new LoginRequest("password@example.com", "NewPassword2"))
                        .accessToken())
                .isNotBlank();
        assertThatThrownBy(() -> authService.refreshAccessToken(first.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> authService.refreshAccessToken(second.refreshToken()))
                .isInstanceOf(InvalidRefreshTokenException.class);
        assertThat(authService.refreshAccessToken(other.refreshToken()).refreshToken())
                .isNotBlank();
    }

    @Test
    void wrongPasswordPreservesPasswordAndSession() {
        var user = createPasswordUser("password@example.com");
        var login = authService.login(new LoginRequest("password@example.com", "CurrentPassword1"));
        assertThatThrownBy(() -> passwordService.changePassword(
                        user.getId(), new ChangePasswordRequest("IncorrectPassword", "NewPassword2")))
                .isInstanceOf(InvalidPasswordException.class);
        assertThat(passwordEncoder.matches(
                        "CurrentPassword1",
                        repository.findById(user.getId()).orElseThrow().getPasswordHash()))
                .isTrue();
        assertThat(authService.refreshAccessToken(login.refreshToken()).accessToken())
                .isNotBlank();
    }

    @Test
    void transactionRollbackRestoresBothPasswordAndRefreshTokens() {
        var user = createPasswordUser("password@example.com");
        var login = authService.login(new LoginRequest("password@example.com", "CurrentPassword1"));
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
            passwordService.changePassword(user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
            status.setRollbackOnly();
        });
        assertThat(passwordEncoder.matches(
                        "CurrentPassword1",
                        repository.findById(user.getId()).orElseThrow().getPasswordHash()))
                .isTrue();
        assertThat(authService.refreshAccessToken(login.refreshToken()).accessToken())
                .isNotBlank();
    }

    @Test
    void concurrentPasswordChangesCannotBothUseTheOldPassword() throws Exception {
        var user = createPasswordUser("password@example.com");
        var barrier = new CyclicBarrier(2);
        Callable<Boolean> change = () -> {
            barrier.await(10, TimeUnit.SECONDS);
            try {
                passwordService.changePassword(
                        user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
                return true;
            } catch (InvalidPasswordException exception) {
                return false;
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(change);
            var second = executor.submit(change);
            assertThat(List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(true, false);
        }
    }

    @Test
    void simultaneousRefreshCannotLeaveASessionAfterPasswordChange() throws Exception {
        var user = createPasswordUser("password@example.com");
        var login = authService.login(new LoginRequest("password@example.com", "CurrentPassword1"));
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var refresh = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    return authService.refreshAccessToken(login.refreshToken());
                } catch (InvalidRefreshTokenException exception) {
                    return null;
                }
            });
            var change = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                passwordService.changePassword(
                        user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
                return true;
            });
            var rotated = refresh.get(20, TimeUnit.SECONDS);
            assertThat(change.get(20, TimeUnit.SECONDS)).isTrue();
            assertThat(refreshTokenRepository.findAll()).isEmpty();
            if (rotated != null) {
                assertThatThrownBy(() -> authService.refreshAccessToken(rotated.refreshToken()))
                        .isInstanceOf(InvalidRefreshTokenException.class);
            }
        }
    }

    @Test
    void simultaneousProfileSaveCannotRestoreThePreviousPassword() throws Exception {
        var user = createPasswordUser("password@u.nus.edu");
        var barrier = new CyclicBarrier(2);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var profile = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                return service.updateUserProfile(
                        user.getId(), new UpdateUserProfileRequest("Changed Name", null, "School of Computing"));
            });
            var password = executor.submit(() -> {
                barrier.await(10, TimeUnit.SECONDS);
                passwordService.changePassword(
                        user.getId(), new ChangePasswordRequest("CurrentPassword1", "NewPassword2"));
                return true;
            });
            profile.get(20, TimeUnit.SECONDS);
            assertThat(password.get(20, TimeUnit.SECONDS)).isTrue();
        }
        var reloaded = repository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getName()).isEqualTo("Changed Name");
        assertThat(passwordEncoder.matches("NewPassword2", reloaded.getPasswordHash()))
                .isTrue();
    }

    @Test
    void persistsProfileAndAllowsUsersToShareARealName() {
        var first = createUser("first@u.nus.edu");
        createUser("second@u.nus.edu");
        service.updateUserProfile(first.getId(), new UpdateUserProfileRequest("Alex Tan", null, null));
        var reloaded = repository.findById(first.getId()).orElseThrow();
        assertThat(reloaded.getEmail()).isEqualTo("first@u.nus.edu");
        assertThat(reloaded.getName()).isEqualTo("Alex Tan");
        assertThat(reloaded.getPasswordHash()).isEqualTo("unchanged-hash");
        assertThat(reloaded.getRoles()).containsExactly(UserRole.USER);
    }

    @Test
    void persistsReadsAndClearsOptionalDetails() {
        var user = createUser("details@u.nus.edu");
        assertThat(service.getUserProfile(user.getId()).phoneNumber()).isNull();
        assertThat(service.getUserProfile(user.getId()).faculty()).isNull();
        service.updateUserProfile(
                user.getId(), new UpdateUserProfileRequest("Alex Tan", " +65 9123-5436 ", " School of Computing "));
        var profile = service.getUserProfile(user.getId());
        assertThat(profile.phoneNumber()).isEqualTo("+6591235436");
        assertThat(profile.faculty()).isEqualTo("School of Computing");
        service.updateUserProfile(user.getId(), new UpdateUserProfileRequest("Alex Tan", " ", " "));
        var reloaded = repository.findById(user.getId()).orElseThrow();
        assertThat(reloaded.getPhoneNumber()).isNull();
        assertThat(reloaded.getFaculty()).isNull();
    }

    @Test
    void filtersUsersByAssignedAndMissingFacultyWithAccurateTotals() {
        var computing = createUser("computing@u.nus.edu");
        computing.setFaculty("School of Computing");
        repository.saveAndFlush(computing);
        var science = createUser("science@u.nus.edu");
        science.setFaculty("Faculty of Science");
        repository.saveAndFlush(science);
        createUser("unassigned@u.nus.edu");

        var pageable = PageRequest.of(0, 1, Sort.by("name"));
        var filtered = service.listUsers(pageable, new UserSearchCriteria("", UserRole.USER, "School of Computing"));
        assertThat(filtered.total()).isEqualTo(1);
        assertThat(filtered.items()).extracting("email").containsExactly("computing@u.nus.edu");
        var missing = service.listUsers(pageable, new UserSearchCriteria("", null, "UNASSIGNED"));
        assertThat(missing.total()).isEqualTo(1);
        assertThat(missing.items()).extracting("email").containsExactly("unassigned@u.nus.edu");
        assertThat(service.listUsers(pageable, new UserSearchCriteria("science", UserRole.USER, "School of Computing"))
                        .total())
                .isZero();
    }

    @Test
    void filtersUsersByMembershipInPostgresqlRoleArray() {
        createUser("user-only@u.nus.edu");
        var adminOnly = createUser("admin-only@u.nus.edu");
        adminOnly.setRoles(List.of(UserRole.ADMIN));
        repository.saveAndFlush(adminOnly);
        var userAndAdmin = createUser("user-and-admin@u.nus.edu");
        userAndAdmin.setRoles(List.of(UserRole.USER, UserRole.ADMIN));
        repository.saveAndFlush(userAndAdmin);

        var pageable = PageRequest.of(0, 10, Sort.by("email"));
        var admins = service.listUsers(pageable, new UserSearchCriteria("", UserRole.ADMIN, null));
        assertThat(admins.total()).isEqualTo(2);
        assertThat(admins.items())
                .extracting("email")
                .containsExactly("admin-only@u.nus.edu", "user-and-admin@u.nus.edu");

        var users = service.listUsers(pageable, new UserSearchCriteria("", UserRole.USER, null));
        assertThat(users.total()).isEqualTo(2);
        assertThat(users.items())
                .extracting("email")
                .containsExactly("user-and-admin@u.nus.edu", "user-only@u.nus.edu");
    }

    @Test
    void facultyMigrationNormalizesKnownValuesAndClearsUnknownValues() throws Exception {
        var database = "faculty_" + UUID.randomUUID().toString().replace("-", "");
        createDatabase(database);
        try {
            var config = Flyway.configure()
                    .dataSource(databaseUrl(database), postgres.getUsername(), postgres.getPassword())
                    .locations("classpath:db/migration");
            config.target("3").load().migrate();
            try (var connection = DriverManager.getConnection(
                            databaseUrl(database), postgres.getUsername(), postgres.getPassword());
                    var statement = connection.createStatement()) {
                statement.execute("""
                        INSERT INTO users (id, email, name, roles, password_hash, created_at, updated_at, faculty)
                        VALUES
                        ('00000000-0000-0000-0000-000000000001', 'computing@example.com', 'A', ARRAY['USER'], 'hash', now(), now(), ' Computing '),
                        ('00000000-0000-0000-0000-000000000002', 'science@example.com', 'B', ARRAY['USER'], 'hash', now(), now(), 'Science'),
                        ('00000000-0000-0000-0000-000000000003', 'unknown@example.com', 'C', ARRAY['USER'], 'hash', now(), now(), 'Unknown')
                        """);
                config.target("latest").load().migrate();
                try (var rows = statement.executeQuery("SELECT faculty FROM users ORDER BY email")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isEqualTo("School of Computing");
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isEqualTo("Faculty of Science");
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString(1)).isNull();
                    assertThat(rows.next()).isFalse();
                }
            }
        } finally {
            dropDatabase(database);
        }
    }

    @Test
    void migrationPreservesAnExistingAccount() throws Exception {
        var database = "profile_" + UUID.randomUUID().toString().replace("-", "");
        createDatabase(database);
        try {
            var config = Flyway.configure()
                    .dataSource(databaseUrl(database), postgres.getUsername(), postgres.getPassword())
                    .locations("classpath:db/migration");
            config.target("2").load().migrate();
            try (var connection = DriverManager.getConnection(
                            databaseUrl(database), postgres.getUsername(), postgres.getPassword());
                    var statement = connection.createStatement()) {
                statement.execute("""
                        INSERT INTO users (id, email, name, roles, password_hash, created_at, updated_at)
                        VALUES ('00000000-0000-0000-0000-000000000001', 'old@example.com', 'Existing User',
                                ARRAY['USER'], 'existing-hash', now(), now())
                        """);
                config.target("latest").load().migrate();
                try (var rows = statement.executeQuery("SELECT * FROM users")) {
                    assertThat(rows.next()).isTrue();
                    assertThat(rows.getString("email")).isEqualTo("old@example.com");
                    assertThat(rows.getString("name")).isEqualTo("Existing User");
                    assertThat(rows.getString("password_hash")).isEqualTo("existing-hash");
                    assertThat(rows.getString("phone_number")).isNull();
                    assertThat(rows.getString("faculty")).isNull();
                    assertThat(rows.getString("avatar_key")).isNull();
                    assertThat(rows.next()).isFalse();
                }
            }
        } finally {
            dropDatabase(database);
        }
    }

    private void createDatabase(String database) throws Exception {
        try (var connection = DriverManager.getConnection(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + database);
        }
    }

    private void dropDatabase(String database) throws Exception {
        try (var connection = DriverManager.getConnection(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
                var statement = connection.createStatement()) {
            statement.execute("DROP DATABASE IF EXISTS " + database + " WITH (FORCE)");
        }
    }

    private String databaseUrl(String database) {
        var jdbc = postgres.getJdbcUrl();
        var current = "/" + postgres.getDatabaseName();
        var index = jdbc.lastIndexOf(current);
        return jdbc.substring(0, index) + "/" + database + jdbc.substring(index + current.length());
    }

    @TestConfiguration
    @EnableTransactionManagement
    @EnableAsync
    @EnableJpaRepositories(basePackageClasses = UserRepository.class)
    @Import({
        EmailVerificationService.class,
        EmailChangeService.class,
        EmailTokenService.class,
        AccountMailListener.class,
        CurrentUserService.class,
        AuthenticationContextService.class,
        AuthenticatedUserResolver.class
    })
    static class TestConfig {
        @Bean
        ThreadPoolTaskExecutor taskExecutor() {
            var executor = new ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1);
            executor.setMaxPoolSize(1);
            return executor;
        }

        @Bean
        AccountMailProperties accountMailProperties() {
            return new AccountMailProperties(
                    "test@example.com",
                    URI.create("http://localhost:3000"),
                    Duration.ofMinutes(30),
                    Duration.ofSeconds(60));
        }

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }

        @Bean
        JavaMailSender mailSender() {
            return mock(JavaMailSender.class);
        }

        @Bean
        PasswordEncoder passwordEncoder() {
            return new BCryptPasswordEncoder(4);
        }

        @Bean
        PasswordService passwordService(
                UserRepository userRepository,
                RefreshTokenRepository refreshTokenRepository,
                PasswordEncoder encoder,
                EmailTokenService emailTokenService,
                EmailTokenRepository emailTokenRepository,
                ApplicationEventPublisher events) {
            return new PasswordService(
                    userRepository,
                    refreshTokenRepository,
                    encoder,
                    emailTokenService,
                    emailTokenRepository,
                    events,
                    mock(CurrentUserService.class));
        }

        @Bean
        TokenService tokenService(RefreshTokenRepository refreshTokenRepository, UserRepository userRepository) {
            var properties = new AuthProperties(
                    Duration.ofMinutes(5),
                    Duration.ofDays(30),
                    new ClassPathResource("unused-private.pem"),
                    new ClassPathResource("unused-public.pem"),
                    "test",
                    false);
            // Exercise credentials and database sessions without testing JWT cryptography here.
            JwtEncoder encoder = parameters -> Jwt.withTokenValue("test-access-token")
                    .header("alg", "ES256")
                    .subject("test-user")
                    .build();
            return new TokenService(refreshTokenRepository, userRepository, Clock.systemUTC(), properties, encoder);
        }

        @Bean
        AuthService authService(UserRepository userRepository, TokenService tokenService, PasswordEncoder encoder) {
            var provider = new DaoAuthenticationProvider(new CustomUserDetailsService(userRepository));
            provider.setPasswordEncoder(encoder);
            AuthenticationManager manager = new ProviderManager(provider);
            return new AuthService(manager, tokenService, userRepository);
        }

        @Bean
        UserService userService(
                UserRepository repository,
                EmailVerificationService verification,
                EmailChangeService emailChangeService) {
            var avatarStorageService = mock(AvatarStorageService.class);
            when(avatarStorageService.createPresignedUrl(any()))
                    .thenAnswer(call ->
                            call.getArgument(0) == null ? null : "https://images.example/" + call.getArgument(0));
            return new UserService(
                    repository,
                    new BCryptPasswordEncoder(),
                    TestMappers.mapper(),
                    mock(ApplicationEventPublisher.class),
                    verification,
                    emailChangeService,
                    avatarStorageService,
                    mock(CurrentUserService.class));
        }
    }
}
