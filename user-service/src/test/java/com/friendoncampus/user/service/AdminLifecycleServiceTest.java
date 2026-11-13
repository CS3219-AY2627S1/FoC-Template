package com.friendoncampus.user.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.friendoncampus.user.domain.AdminLifecycleState;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.domain.UserRole;
import com.friendoncampus.user.domain.UserStatus;
import com.friendoncampus.user.repository.AdminLifecycleStateRepository;
import com.friendoncampus.user.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class AdminLifecycleServiceTest {
    @Mock AdminLifecycleStateRepository lifecycleState;
    @Mock UserRepository users;
    private AdminLifecycleService service;
    private User actor;
    private User target;

    @BeforeEach
    void setUp() {
        service = new AdminLifecycleService(lifecycleState, users, mock(UserAccountAudit.class));
        actor = activeAdmin("admin@u.nus.edu", "Admin", "admin");
        target = activeUser("member@u.nus.edu", "Member", "member");
        lenient().when(lifecycleState.lockForLifecycleChange(AdminLifecycleState.ID)).thenReturn(Optional.of(mock(AdminLifecycleState.class)));
        lenient().when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
        lenient().when(users.findById(target.getId())).thenReturn(Optional.of(target));
        lenient().when(users.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
    }

    @Test
    void findsOnlyTheExactUuidAndPreservesPaginationAndAdminAuthorization() {
        var first = org.springframework.data.domain.PageRequest.of(0, 1);
        assertThat(service.list(actor.getId(), " " + target.getId().toString().toUpperCase() + " ", first).getContent()).containsExactly(target);
        var later = service.list(actor.getId(), target.getId().toString(), org.springframework.data.domain.PageRequest.of(1, 1));
        assertThat(later.getContent()).isEmpty();
        assertThat(later.getTotalElements()).isEqualTo(1);
        UUID missing = UUID.randomUUID();
        when(users.findById(missing)).thenReturn(Optional.empty());
        assertThat(service.list(actor.getId(), missing.toString(), first).getTotalElements()).isZero();
        verify(users, never()).searchByEmailOrUsername(anyString(), any());
        actor.ban();
        assertThatThrownBy(() -> service.list(actor.getId(), target.getId().toString(), first)).isInstanceOf(AdminAccessDeniedException.class);
    }

    @Test
    void preservesExistingNameSearch() {
        var page = org.springframework.data.domain.PageRequest.of(0, 20);
        when(users.searchByEmailOrUsername("Member", page)).thenReturn(org.springframework.data.domain.Page.empty(page));
        service.list(actor.getId(), " Member ", page);
        verify(users).searchByEmailOrUsername("Member", page);
    }

    @Test
    void promotesAndDemotesAnActiveAccount() {
        User promoted = service.promote(actor.getId(), target.getId());
        assertThat(promoted.hasRole(UserRole.ADMIN)).isTrue();

        when(users.countByRolesContainingAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(2L);
        User demoted = service.demote(actor.getId(), target.getId());
        assertThat(demoted.hasRole(UserRole.ADMIN)).isFalse();
        assertThat(demoted.hasRole(UserRole.REQUESTER)).isTrue();
    }

    @Test
    void bansAndReactivatesOnlyAnActiveAccount() {
        User banned = service.ban(actor.getId(), target.getId());
        assertThat(banned.getStatus()).isEqualTo(UserStatus.BANNED);

        User reactivated = service.reactivate(actor.getId(), target.getId(), "Reviewed account appeal");
        assertThat(reactivated.getStatus()).isEqualTo(UserStatus.ACTIVE);
    }

    @Test
    void rejectsSelfRevocationAndUnverifiedTargets() {
        when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
        assertThatThrownBy(() -> service.demote(actor.getId(), actor.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("cannot revoke their own");

        User unverified = User.register("unverified@u.nus.edu", "Unverified", "unverified", "hash");
        when(users.findById(unverified.getId())).thenReturn(Optional.of(unverified));
        assertThatThrownBy(() -> service.ban(actor.getId(), unverified.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("Only active accounts");
    }

    @Test
    void protectsTheFinalActiveAdministratorFromDemotionAndBan() {
        target.promoteToAdmin();
        when(users.countByRolesContainingAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(1L);

        assertThatThrownBy(() -> service.demote(actor.getId(), target.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("final active administrator");
        assertThatThrownBy(() -> service.ban(actor.getId(), target.getId()))
                .isInstanceOf(AdminLifecycleException.class).hasMessageContaining("final active administrator");
    }

    @Test
    void rejectsAStaleOrBannedAdministratorEvenWhenTheirJwtRoleWasAdmin() {
        actor.ban();

        assertThatThrownBy(() -> service.promote(actor.getId(), target.getId()))
                .isInstanceOf(AdminAccessDeniedException.class).hasMessageContaining("Administrator access");
    }

    private User activeUser(String email, String username, String normalizedUsername) {
        User user = User.register(email, username, normalizedUsername, "hash");
        user.activate();
        return user;
    }

    private User activeAdmin(String email, String username, String normalizedUsername) {
        User user = activeUser(email, username, normalizedUsername);
        user.promoteToAdmin();
        return user;
    }
    @Test void caseBanUsesTheSameFinalAdministratorGuardAndRequiresReactivationReason() {
        target.promoteToAdmin();when(users.countByRolesContainingAndStatus(UserRole.ADMIN, UserStatus.ACTIVE)).thenReturn(1L);
        assertThat(service.banForCase(actor.getId(),target.getId()).reasonCode()).isEqualTo("LAST_ADMIN_PROTECTED");
        assertThat(service.banForCase(actor.getId(),actor.getId()).reasonCode()).isEqualTo("SELF_SANCTION_FORBIDDEN");
        assertThatThrownBy(()->service.reactivate(actor.getId(),target.getId()," ")).isInstanceOf(IllegalArgumentException.class);
    }

}
