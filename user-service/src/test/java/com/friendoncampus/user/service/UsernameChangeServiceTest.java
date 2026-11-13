package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class UsernameChangeServiceTest {
    @Mock UserRepository users;
    @InjectMocks UsernameChangeService service;

    @Test
    void changesTheDisplayUsernameAndStoresItsCaseInsensitiveForm() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(users.findByUsernameNormalized("alice tan")).thenReturn(Optional.empty());
        when(users.save(user)).thenReturn(user);

        User updated = service.changeUsername(user.getId(), "Alice Tan");

        assertThat(updated.getUsername()).isEqualTo("Alice Tan");
    }

    @Test
    void rejectsAUsernameAlreadyUsedWithDifferentCaseByAnotherUser() {
        User user = User.register("alice@u.nus.edu", "Alice", "alice", "hash");
        User existing = User.register("bob@u.nus.edu", "BOB", "bob", "hash");
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(users.findByUsernameNormalized("bob")).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.changeUsername(user.getId(), "bob"))
                .isInstanceOf(UsernameChangeService.UsernameAlreadyTakenException.class)
                .hasMessage("username is already taken");
    }
}
