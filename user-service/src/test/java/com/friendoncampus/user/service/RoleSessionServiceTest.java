package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class RoleSessionServiceTest {
    @Mock UserRepository users;
    @Mock JwtTokenService tokens;

    @Test
    void letsAnActiveRequesterEnableCourierAndIssuesACourierScopedToken() {
        User user = activeUser();
        JwtTokenService.IssuedToken token = new JwtTokenService.IssuedToken("courier.jwt", Instant.now().plusSeconds(900));
        when(users.findById(user.getId())).thenReturn(Optional.of(user));
        when(tokens.issue(user, UserRole.COURIER)).thenReturn(token);

        RoleSessionService.RoleSession session = new RoleSessionService(users, tokens)
                .switchRole(user.getId(), UserRole.COURIER);

        assertThat(session.effectiveRole()).isEqualTo(UserRole.COURIER);
        assertThat(session.token()).isEqualTo(token);
        assertThat(user.getRoles()).containsExactlyInAnyOrder(UserRole.REQUESTER, UserRole.COURIER);
        verify(users).save(user);
    }

    @Test
    void onlyAnAccountWithThePersistedAdministratorAssignmentCanSelectAdministrator() {
        User requester = activeUser();
        when(users.findById(requester.getId())).thenReturn(Optional.of(requester));

        assertThatThrownBy(() -> new RoleSessionService(users, tokens).switchRole(requester.getId(), UserRole.ADMIN))
                .isInstanceOf(RoleSessionAccessDeniedException.class)
                .hasMessage("This account is not allowed to use that role");
    }

    @Test
    void activeAdministratorCanSelectAdministratorWithoutLosingRequesterAssignment() {
        User admin = activeUser();
        admin.promoteToAdmin();
        JwtTokenService.IssuedToken token = new JwtTokenService.IssuedToken("admin.jwt", Instant.now().plusSeconds(900));
        when(users.findById(admin.getId())).thenReturn(Optional.of(admin));
        when(tokens.issue(admin, UserRole.ADMIN)).thenReturn(token);

        RoleSessionService.RoleSession session = new RoleSessionService(users, tokens)
                .switchRole(admin.getId(), UserRole.ADMIN);

        assertThat(session.effectiveRole()).isEqualTo(UserRole.ADMIN);
        assertThat(admin.getRoles()).containsExactlyInAnyOrder(UserRole.REQUESTER, UserRole.ADMIN);
    }

    @Test
    void rejectsAnInactiveAccountBeforeIssuingAReplacementToken() {
        User user = activeUser();
        user.ban();
        when(users.findById(user.getId())).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> new RoleSessionService(users, tokens).switchRole(user.getId(), UserRole.REQUESTER))
                .isInstanceOf(RoleSessionAccessDeniedException.class)
                .hasMessage("An active account is required");
    }

    private User activeUser() {
        User user = User.register("member-" + UUID.randomUUID() + "@u.nus.edu", "Member", "member" + UUID.randomUUID(), "hash");
        user.activate();
        return user;
    }
}
