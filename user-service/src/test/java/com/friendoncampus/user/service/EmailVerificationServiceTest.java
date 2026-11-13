package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.Optional;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.friendoncampus.user.domain.*;
import com.friendoncampus.user.repository.*;
import com.friendoncampus.user.support.FakeEmailVerificationMailer;
import com.friendoncampus.user.messaging.UserActivationEvents;

@ExtendWith(MockitoExtension.class)
class EmailVerificationServiceTest {
 private static final Instant NOW = Instant.parse("2030-01-01T00:00:00Z");
 @Mock UserRepository users; @Mock EmailVerificationAttemptRepository attempts; @Mock PasswordEncoder passwords;
 @Mock UserActivationEvents events;
 private FakeEmailVerificationMailer mailer; private EmailVerificationService service; private User user;
 @BeforeEach void setUp() { mailer = new FakeEmailVerificationMailer(); service = new EmailVerificationService(users, attempts, passwords, mailer, Clock.fixed(NOW, ZoneOffset.UTC), events); user = User.register("alice@u.nus.edu", "Alice", "alice", "hash"); }

 @Test void sendsAHashedSixDigitCodeForNewRegistration() {
 when(passwords.encode(anyString())).thenAnswer(i -> "hashed-" + i.getArgument(0));
  when(attempts.save(any())).thenAnswer(i -> i.getArgument(0));
  service.issueInitial(user);
  ArgumentCaptor<EmailVerificationAttempt> captured = ArgumentCaptor.forClass(EmailVerificationAttempt.class);
  verify(attempts).invalidateActiveForUser(eq(user.getId()), any()); verify(attempts).save(captured.capture());
  assertThat(user.getStatus()).isEqualTo(UserStatus.UNVERIFIED); assertThat(mailer.messages()).hasSize(1);
  String code = mailer.messages().get(0).code(); assertThat(code).matches("\\d{6}"); assertThat(captured.getValue().getVerifier()).isEqualTo("hashed-" + code); assertThat(captured.getValue().getSentAt()).isNotNull();
 }

 @Test void verifiesOneUsableCodeAndActivatesTheAccount() {
  EmailVerificationAttempt attempt = attempt(NOW.plusSeconds(600));
  when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
  when(attempts.findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId())).thenReturn(Optional.of(attempt));
  when(passwords.matches("123456", "verifier")).thenReturn(true);
  service.verify("alice@u.nus.edu", "123456");
  assertThat(user.getStatus()).isEqualTo(UserStatus.ACTIVE); verify(users).save(user); verify(attempts).save(attempt);
  verify(events).record(user.getId(), OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC));
 }

 @Test void rejectsExpiredReplayAndFiveIncorrectAttempts() {
  EmailVerificationAttempt expired = attempt(NOW.minusSeconds(1));
  when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
  when(attempts.findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId())).thenReturn(Optional.of(expired));
  assertThatThrownBy(() -> service.verify("alice@u.nus.edu", "123456")).isInstanceOf(InvalidEmailVerificationCodeException.class);
  EmailVerificationAttempt wrong = attempt(NOW.plusSeconds(600));
  when(attempts.findFirstByUser_IdAndSentAtIsNotNullAndUsedAtIsNullAndInvalidatedAtIsNullOrderByCreatedAtDesc(user.getId())).thenReturn(Optional.of(wrong));
  when(passwords.matches("000000", "verifier")).thenReturn(false);
  for (int i = 0; i < 5; i++) assertThatThrownBy(() -> service.verify("alice@u.nus.edu", "000000")).isInstanceOf(InvalidEmailVerificationCodeException.class);
  assertThat(wrong.getAttempts()).isEqualTo(5);
  verifyNoInteractions(events);
 }

 @Test void resendsAfterCooldownAndInvalidatesEarlierAttempts() {
  EmailVerificationAttempt previous = attempt(NOW.minusSeconds(91));
  previous.markSent(OffsetDateTime.ofInstant(NOW.minusSeconds(91), ZoneOffset.UTC));
  when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
  when(attempts.findFirstByUser_IdAndSentAtIsNotNullOrderBySentAtDesc(user.getId())).thenReturn(Optional.of(previous));
 when(passwords.encode(anyString())).thenReturn("verifier");
  when(attempts.save(any())).thenAnswer(i -> i.getArgument(0));
  service.resend("alice@u.nus.edu");
  verify(attempts).invalidateActiveForUser(eq(user.getId()), any()); assertThat(mailer.messages()).hasSize(1);
 }

 @Test void rejectsResendDuringCooldownAndReturnsSpecificStatusConditions() {
  EmailVerificationAttempt previous = attempt(NOW);
  when(users.findByEmailForUpdate("alice@u.nus.edu")).thenReturn(Optional.of(user));
  when(attempts.findFirstByUser_IdAndSentAtIsNotNullOrderBySentAtDesc(user.getId())).thenReturn(Optional.of(previous));
  assertThatThrownBy(() -> service.resend("alice@u.nus.edu")).isInstanceOf(EmailVerificationCooldownException.class);
  when(users.findByEmailForUpdate("missing@u.nus.edu")).thenReturn(Optional.empty());
  assertThatThrownBy(() -> service.resend("missing@u.nus.edu")).isInstanceOf(EmailVerificationNotFoundException.class);
  User active = User.register("active@u.nus.edu", "Active", "active", "hash"); active.activate(); when(users.findByEmailForUpdate("active@u.nus.edu")).thenReturn(Optional.of(active));
  assertThatThrownBy(() -> service.resend("active@u.nus.edu")).isInstanceOf(EmailAlreadyVerifiedException.class);
 }

 private EmailVerificationAttempt attempt(Instant expiresAt) { OffsetDateTime now = OffsetDateTime.ofInstant(NOW, ZoneOffset.UTC); EmailVerificationAttempt attempt = EmailVerificationAttempt.issue(user, "verifier", now, OffsetDateTime.ofInstant(expiresAt, ZoneOffset.UTC)); attempt.markSent(now); return attempt; }
}
