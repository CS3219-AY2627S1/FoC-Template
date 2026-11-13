package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class PasswordChangeServiceTest {
    @Mock UserRepository users;
    @Mock PasswordEncoder passwords;
    @InjectMocks PasswordChangeService service;

    @Test
    void replacesTheStoredHashOnlyAfterTheCurrentPasswordMatches() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "old-hash");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwords.matches("current-password", "old-hash")).thenReturn(true);
        when(passwords.encode("replacement-password-with-15-chars")).thenReturn("new-hash");

        service.changePassword(user.getId(), "current-password", "replacement-password-with-15-chars");

        verify(passwords).matches("current-password", "old-hash");
        verify(passwords).encode("replacement-password-with-15-chars");
        verify(users).save(user);
    }

    @Test
    void rejectsAnIncorrectCurrentPasswordWithoutChangingTheHash() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "old-hash");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwords.matches("wrong-password", "old-hash")).thenReturn(false);

        assertThatThrownBy(() -> service.changePassword(user.getId(), "wrong-password", "replacement-password-with-15-chars"))
                .isInstanceOf(PasswordChangeService.CurrentPasswordIncorrectException.class)
                .hasMessage("Current password is incorrect");

        verify(passwords, never()).encode(anyString());
        verify(users, never()).save(user);
    }

    @Test
    void rejectsAReplacementMatchingTheCurrentPasswordWithoutChangingTheHash() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "old-hash");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(passwords.matches("current-password", "old-hash")).thenReturn(true);

        assertThatThrownBy(() -> service.changePassword(user.getId(), "current-password", "current-password"))
                .isInstanceOf(PasswordReuseException.class)
                .hasMessage("New password must be different from your current password");

        verify(passwords, never()).encode(anyString());
        verify(users, never()).save(user);
    }
}
