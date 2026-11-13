package com.friendoncampus.user.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;
import org.springframework.security.crypto.password.PasswordEncoder;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:security;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.username=sa",
        "spring.datasource.password="
})
@AutoConfigureMockMvc
class CurrentUserSecurityTest {
    private static final String ISSUER = "friend-on-campus-user-service";
    private static final String AUDIENCE = "friend-on-campus-api";

    @Autowired com.friendoncampus.user.service.JwtTokenService tokens;
    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @Autowired JwtDecoder decoder;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder passwords;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void issuesAVerifiableTokenForValidLogin() throws Exception {
        String email = "login-" + UUID.randomUUID() + "@u.nus.edu";
        User user = User.register(email, "Alice", "alice" + UUID.randomUUID().toString().substring(0, 8),
                passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        MvcResult result = mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"" + email + "\",\"password\":\"password-with-at-least-15-chars\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andReturn();

        String token = result.getResponse().getContentAsString()
                .replaceFirst(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        assertThat(decoder.decode(token).getSubject()).isEqualTo(user.getId().toString());
    }

    @Test
    void returnsThePersistedProfileForTheAuthenticatedUser() throws Exception {
        User user = User.register("profile-" + UUID.randomUUID() + "@u.nus.edu", "Persisted Alice",
                "persisted" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().plusSeconds(60), user.getId())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andExpect(jsonPath("$.email").value(user.getEmail()))
                .andExpect(jsonPath("$.username").value("Persisted Alice"))
                .andExpect(jsonPath("$.roles").isArray())
                .andExpect(jsonPath("$.roles[0]").value("REQUESTER"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.createdAt").exists());
    }

    @Test
    void replacesTheSessionTokenWhenAnActiveUserSelectsCourier() throws Exception {
        User user = User.register("workspace-" + UUID.randomUUID() + "@u.nus.edu", "Workspace user",
                "workspace" + UUID.randomUUID().toString().substring(0, 8),
                passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        MvcResult result = mvc.perform(patch("/api/users/me/session-role")
                        .header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                                Instant.now().plusSeconds(60), user.getId()))
                        .contentType("application/json").content("{\"role\":\"COURIER\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("COURIER"))
                .andExpect(jsonPath("$.availableRoles[?(@ == 'REQUESTER')]").exists())
                .andExpect(jsonPath("$.availableRoles[?(@ == 'COURIER')]").exists())
                .andReturn();

        String replacement = result.getResponse().getContentAsString()
                .replaceFirst(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        assertThat(decoder.decode(replacement).getClaimAsString("role")).isEqualTo("COURIER");
        assertThat(users.findById(user.getId())).hasValueSatisfying(updated ->
                assertThat(updated.getRoles()).containsExactlyInAnyOrder(
                        com.friendoncampus.user.domain.UserRole.REQUESTER,
                        com.friendoncampus.user.domain.UserRole.COURIER));
    }

    @Test
    void doesNotLetARequesterSelectAdministrator() throws Exception {
        User user = User.register("not-admin-" + UUID.randomUUID() + "@u.nus.edu", "Requester",
                "requester" + UUID.randomUUID().toString().substring(0, 8),
                passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        mvc.perform(patch("/api/users/me/session-role")
                        .header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                                Instant.now().plusSeconds(60), user.getId()))
                        .contentType("application/json").content("{\"role\":\"ADMIN\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.title").value("Role selection unavailable"));
    }

    @Test
    void changesOnlyTheAuthenticatedUsersUsername() throws Exception {
        User user = User.register("rename-" + UUID.randomUUID() + "@u.nus.edu", "Old name",
                "old" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        users.save(user);

        mvc.perform(patch("/api/users/me/username").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().plusSeconds(60), user.getId())).contentType("application/json")
                        .content("{\"username\":\"New Name\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId().toString()))
                .andExpect(jsonPath("$.username").value("New Name"));

        assertThat(users.findById(user.getId())).hasValueSatisfying(updated ->
                assertThat(updated.getUsername()).isEqualTo("New Name"));
    }

    @Test
    void rejectsInvalidUsernameChangePayloadsBeforeChangingTheProfile() throws Exception {
        User user=User.register("invalid-name-"+UUID.randomUUID()+"@u.nus.edu","Valid","valid"+UUID.randomUUID().toString().substring(0,8),"hash");
        user.activate();users.save(user);
        mvc.perform(patch("/api/users/me/username").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().plusSeconds(60), user.getId())).contentType("application/json")
                        .content("{\"username\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void changesThePasswordOnlyWhenTheAuthenticatedUserSuppliesTheCurrentPassword() throws Exception {
        User user = User.register("password-" + UUID.randomUUID() + "@u.nus.edu", "Alice",
                "password" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("current-password-with-15-chars"));
        user.activate();
        users.save(user);
        String token = token(ISSUER, List.of(AUDIENCE), Instant.now().plusSeconds(60), user.getId());

        mvc.perform(patch("/api/users/me/password").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-password-with-15-chars\",\"newPassword\":\"replacement-password-with-15-chars\"}"))
                .andExpect(status().isNoContent());

        mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"current-password-with-15-chars\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/users/login").contentType("application/json")
                        .content("{\"email\":\"" + user.getEmail() + "\",\"password\":\"replacement-password-with-15-chars\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void rejectsAnIncorrectCurrentPasswordAndInvalidPayloads() throws Exception {
        User user = User.register("password-" + UUID.randomUUID() + "@u.nus.edu", "Alice",
                "password" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("current-password-with-15-chars"));
        user.activate();
        users.save(user);
        String token = token(ISSUER, List.of(AUDIENCE), Instant.now().plusSeconds(60), user.getId());

        mvc.perform(patch("/api/users/me/password").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"wrong-password\",\"newPassword\":\"replacement-password-with-15-chars\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Current password is incorrect"));
        mvc.perform(patch("/api/users/me/password").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-password-with-15-chars\",\"newPassword\":\"current-password-with-15-chars\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("New password must be different from your current password"))
                .andExpect(jsonPath("$.code").value("PASSWORD_REUSE"));
        mvc.perform(patch("/api/users/me/password").header("Authorization", "Bearer " + token)
                        .contentType("application/json")
                        .content("{\"currentPassword\":\"current-password-with-15-chars\",\"newPassword\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void requiresAuthenticationToChangeAPassword() throws Exception {
        mvc.perform(patch("/api/users/me/password").contentType("application/json")
                        .content("{\"currentPassword\":\"current-password-with-15-chars\",\"newPassword\":\"replacement-password-with-15-chars\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsSpecificConflictWhenAnotherAccountOwnsTheUsername() throws Exception {
        User user = User.register("rename-" + UUID.randomUUID() + "@u.nus.edu", "Alice",
                "alice" + UUID.randomUUID().toString().substring(0, 8), passwords.encode("password-with-at-least-15-chars"));
        User existing = User.register("existing-" + UUID.randomUUID() + "@u.nus.edu", "Taken",
                "taken", passwords.encode("password-with-at-least-15-chars"));
        user.activate();
        existing.activate();
        users.save(user);
        users.save(existing);

        mvc.perform(patch("/api/users/me/username").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().plusSeconds(60), user.getId())).contentType("application/json")
                        .content("{\"username\":\"taken\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("username is already taken"));
    }

    @Test
    void rejectsExpiredMalformedWrongIssuerAndWrongAudienceTokens() throws Exception {
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of(AUDIENCE),
                Instant.now().minusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer not-a-jwt")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token("other-issuer", List.of(AUDIENCE),
                Instant.now().plusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token(ISSUER, List.of("other-audience"),
                Instant.now().plusSeconds(60), UUID.randomUUID()))).andExpect(status().isUnauthorized());
    }

    @Test
    void publishesOnlyPublicJwkMaterial() throws Exception {
        mvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].kid").value("user-service-rs256-1"))
                .andExpect(jsonPath("$.keys[0].d").doesNotExist());
    }

    @Test
    void permitsPasswordResetCodeValidationWithoutAnAccessToken() throws Exception {
        mvc.perform(post("/api/users/password-reset-verifications").contentType("application/json")
                        .content("{\"email\":\"missing@u.nus.edu\",\"code\":\"123456\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Invalid or expired password reset code"));
    }

    @Test
    void realIssuedTokenLosesProfileAndMutationAccessAfterBanAndRecoversAfterReactivation() throws Exception {
        User user=User.register("stale-"+UUID.randomUUID()+"@u.nus.edu","Stale","stale"+UUID.randomUUID().toString().substring(0,8),"hash");
        user.activate();users.save(user);
        String before=tokens.issue(user,com.friendoncampus.user.domain.UserRole.REQUESTER).value();
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+before)).andExpect(status().isOk());
        user.ban();users.save(user);
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+before)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/me/username").header("Authorization","Bearer "+before)
                .contentType("application/json").content("{\"username\":\"Blocked\"}")).andExpect(status().isForbidden());
        assertThat(users.findById(user.getId()).orElseThrow().getUsername()).isEqualTo("Stale");
        user.activate();users.save(user);
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+before)).andExpect(status().isOk());
    }
    @Test
    void realIssuedAdminTokenCannotAccessProfileAfterRoleRemovalButRequesterTokenStillWorks() throws Exception {
        User user=User.bootstrapAdmin("demote-"+UUID.randomUUID()+"@u.nus.edu","Demote","demote"+UUID.randomUUID().toString().substring(0,8),"hash");
        user.activate();users.save(user);
        String admin=tokens.issue(user,com.friendoncampus.user.domain.UserRole.ADMIN).value();
        String requester=tokens.issue(user,com.friendoncampus.user.domain.UserRole.REQUESTER).value();
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+admin)).andExpect(status().isOk());
        user.demoteToUser();users.save(user);
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+admin)).andExpect(status().isForbidden());
        mvc.perform(get("/api/users/me").header("Authorization","Bearer "+requester)).andExpect(status().isOk());
    }

    private String token(String issuer, List<String> audience, Instant expiresAt, UUID userId) {
        Instant issuedAt = expiresAt.isBefore(Instant.now()) ? expiresAt.minusSeconds(60) : Instant.now().minusSeconds(1);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject(userId.toString())
                .audience(audience)
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("username", "Alice")
                .claim("role", "REQUESTER")
                .build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(SignatureAlgorithm.RS256).keyId("user-service-rs256-1").build(), claims)).getTokenValue();
    }
}
