/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;

class RoleProvidersTest {

    private static final String USER_ID = "firebase-user-123";

    private UserRepository userRepository;
    private MongoUserServiceRoleProvider mongoRoleProvider;
    private CallerRoles callerRoles;

    @BeforeEach
    void setUp() {
        userRepository = mock(UserRepository.class);
        mongoRoleProvider =
                new MongoUserServiceRoleProvider(userRepository);

        callerRoles = new CallerRoles(mongoRoleProvider);
    }

    @Test
    void returnsRolesForActiveUser() {
        User user = userWithRoles(
                List.of("requester", "courier", "admin"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        Set<Role> roles = mongoRoleProvider.rolesFor(firebaseToken());

        assertThat(roles).containsExactlyInAnyOrder(
                Role.REQUESTER,
                Role.COURIER,
                Role.ADMIN);
    }

    @Test
    void returnsSingleRoleForActiveUser() {
        User user = userWithRoles(
                List.of("courier"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        Set<Role> roles = mongoRoleProvider.rolesFor(firebaseToken());

        assertThat(roles).containsExactly(Role.COURIER);
    }

    @Test
    void ignoresUnknownRoles() {
        User user = userWithRoles(
                List.of("requester", "unknown-role"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        Set<Role> roles = mongoRoleProvider.rolesFor(firebaseToken());

        assertThat(roles).containsExactly(Role.REQUESTER);
    }

    @Test
    void returnsEmptyRolesWhenUserHasNoRoles() {
        User user = userWithRoles(null, AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        assertThat(mongoRoleProvider.rolesFor(firebaseToken()))
                .isEmpty();
    }

    @Test
    void returnsEmptyRolesForInactiveUser() {
        User user = userWithRoles(
                List.of("admin"),
                AccountStatus.DEACTIVATED);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        assertThat(mongoRoleProvider.rolesFor(firebaseToken()))
                .isEmpty();
    }

    @Test
    void returnsEmptyRolesWhenUserIsNotFound() {
        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.empty());

        assertThat(mongoRoleProvider.rolesFor(firebaseToken()))
                .isEmpty();
    }

    @Test
    void callerRolesRecognisesAdmin() {
        User user = userWithRoles(
                List.of("admin"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        Authentication authentication = jwtAuthentication();

        assertThat(callerRoles.isAdmin(authentication)).isTrue();
        assertThat(callerRoles.hasRole(authentication, "admin")).isTrue();
    }

    @Test
    void callerRolesRejectsNonAdmin() {
        User user = userWithRoles(
                List.of("courier"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        Authentication authentication = jwtAuthentication();

        assertThat(callerRoles.isAdmin(authentication)).isFalse();
        assertThat(callerRoles.hasRole(authentication, "courier")).isTrue();
    }

    @Test
    void callerRolesReturnsFalseForUnknownRole() {
        User user = userWithRoles(
                List.of("admin"),
                AccountStatus.ACTIVE);

        when(userRepository.findByUserId(USER_ID))
                .thenReturn(Optional.of(user));

        assertThat(callerRoles.hasRole(
                jwtAuthentication(), "unknown-role")).isFalse();
    }

    @Test
    void callerRolesReturnsEmptySetForNonJwtAuthentication() {
        Authentication authentication =
                new TestingAuthenticationToken("user", "password");

        assertThat(callerRoles.of(authentication)).isEmpty();

        verifyNoInteractions(userRepository);
    }

    private User userWithRoles(
            List<String> roles,
            AccountStatus status) {

        User user = mock(User.class);

        when(user.getStatus()).thenReturn(status);
        when(user.getRoles()).thenReturn(roles);

        return user;
    }

    private Jwt firebaseToken() {
        Instant now = Instant.now();

        return Jwt.withTokenValue("firebase-token")
                .header("alg", "RS256")
                .subject(USER_ID)
                .issuer("https://securetoken.google.com/demo-foc")
                .audience(List.of("demo-foc"))
                .issuedAt(now)
                .expiresAt(now.plusSeconds(3600))
                .build();
    }

    private JwtAuthenticationToken jwtAuthentication() {
        return new JwtAuthenticationToken(firebaseToken());
    }
}
