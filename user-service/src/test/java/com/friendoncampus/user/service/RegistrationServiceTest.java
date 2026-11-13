package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.domain.UserStatus;

@ExtendWith(MockitoExtension.class)
class RegistrationServiceTest {
 @Mock UserRepository users; @Mock PasswordEncoder passwords; @Mock EmailVerificationService emailVerifications; @InjectMocks RegistrationService service;
 @Test void registersNormalizedNusEmailWithHashedPassword() {
  when(users.findByEmail("a@u.nus.edu")).thenReturn(Optional.empty()); when(users.findByUsernameNormalized("alice")).thenReturn(Optional.empty());
  when(passwords.encode("123456789012345")).thenReturn("hash"); when(users.save(any())).thenAnswer(i -> i.getArgument(0));
  User user=service.register(" A@U.NUS.EDU ","Alice","123456789012345");
  assertThat(user.getEmail()).isEqualTo("a@u.nus.edu"); assertThat(user.getUsername()).isEqualTo("Alice"); assertThat(user.getStatus()).isEqualTo(UserStatus.UNVERIFIED); assertThat(user.getPasswordHash()).isNotNull(); verify(passwords).encode("123456789012345"); verify(emailVerifications).issueInitial(user);
 }
 @Test void rejectsDuplicateEmail() { when(users.findByEmail("a@u.nus.edu")).thenReturn(Optional.of(mock(User.class))); assertThatThrownBy(() -> service.register("a@u.nus.edu","alice","123456789012345")).hasMessage("email is already taken"); }
 @Test void rejectsIneligibleDomain() { assertThatThrownBy(() -> service.register("a@example.com","alice","123456789012345")).hasMessageContaining("eligible NUS"); }
}
