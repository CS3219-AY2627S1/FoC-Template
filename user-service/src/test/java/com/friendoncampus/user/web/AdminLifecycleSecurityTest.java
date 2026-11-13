package com.friendoncampus.user.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:adminsecurity;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=" })
@AutoConfigureMockMvc
class AdminLifecycleSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired JwtEncoder encoder;
    @Autowired UserRepository users;

    @DynamicPropertySource
    static void jwtProperties(DynamicPropertyRegistry registry) {
        JwtTestProperties.register(registry);
    }

    @Test
    void exactUuidSearchReturnsTheOwnerNameOnlyToAnActiveAdministrator() throws Exception {
        User admin = activeAdmin("lookup-admin@u.nus.edu", "LookupAdmin", "lookupadmin");
        User member = activeUser("lookup-member@u.nus.edu", "LookupMember", "lookupmember");
        users.save(admin); users.save(member);
        String route = "/api/users/admin/accounts";
        mvc.perform(get(route).param("query", member.getId().toString()).param("size", "1")
                .header("Authorization", "Bearer " + token(admin, "ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].userId").value(member.getId().toString()))
                .andExpect(jsonPath("$.content[0].username").value("LookupMember"));
        mvc.perform(get(route).param("query", member.getId().toString())
                .header("Authorization", "Bearer " + token(member, "REQUESTER"))).andExpect(status().isForbidden());
        mvc.perform(get(route).param("query", member.getId().toString())).andExpect(status().isUnauthorized());
        admin.ban(); users.save(admin);
        mvc.perform(get(route).param("query", member.getId().toString())
                .header("Authorization", "Bearer " + token(admin, "ADMIN"))).andExpect(status().isForbidden());
    }

    @Test
    void requiresAnAdminTokenAndPerformsAnAllowedRolePromotion() throws Exception {
        User admin = activeAdmin("admin-security@u.nus.edu", "Admin", "adminsecurity");
        User member = activeUser("member-security@u.nus.edu", "Member", "membersecurity");
        users.save(admin);
        users.save(member);

        mvc.perform(get("/api/users/admin/accounts").header("Authorization", "Bearer " + token(member, "REQUESTER")))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/admin/accounts/{id}/role", member.getId())
                        .header("Authorization", "Bearer " + token(admin, "ADMIN"))
                        .contentType("application/json").content("{\"administrator\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(member.getId().toString()))
                .andExpect(jsonPath("$.roles").isArray())
                .andExpect(jsonPath("$.roles[?(@ == 'ADMIN')]").exists());
    }

    @Test
    void rejectsAStaleAdminTokenAfterThePersistedAccountIsNoLongerAnAdmin() throws Exception {
        User formerAdmin = activeUser("former-admin@u.nus.edu", "Former", "formeradmin");
        User member = activeUser("member-stale@u.nus.edu", "Member", "memberstale");
        users.save(formerAdmin);
        users.save(member);

        mvc.perform(patch("/api/users/admin/accounts/{id}/role", member.getId())
                        .header("Authorization", "Bearer " + token(formerAdmin, "ADMIN"))
                        .contentType("application/json").content("{\"administrator\":true}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void reportsAnInvalidUnverifiedLifecycleRequestAsAConflict() throws Exception {
        User admin = activeAdmin("admin-status@u.nus.edu", "Admin", "adminstatus");
        User member = activeUser("member-status@u.nus.edu", "Member", "memberstatus");
        users.save(admin);
        users.save(member);

        mvc.perform(patch("/api/users/admin/accounts/{id}/status", member.getId())
                        .header("Authorization", "Bearer " + token(admin, "ADMIN"))
                        .contentType("application/json").content("{\"status\":\"UNVERIFIED\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void reactivationRequiresReasonAndRecordsAnOwnerAudit() throws Exception {
        User admin=activeAdmin("appeal-admin@u.nus.edu","AppealAdmin","appealadmin");
        User member=activeUser("appeal-member@u.nus.edu","AppealMember","appealmember");member.ban();users.save(admin);users.save(member);
        String path="/api/users/admin/accounts/"+member.getId()+"/status";
        mvc.perform(patch(path).header("Authorization","Bearer "+token(admin,"ADMIN")).contentType("application/json").content("{\"status\":\"ACTIVE\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch(path).header("Authorization","Bearer "+token(admin,"ADMIN")).contentType("application/json").content("{\"status\":\"ACTIVE\",\"reason\":\"Reviewed appeal\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    private String token(User user, String role) {
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("friend-on-campus-user-service")
                .subject(user.getId().toString()).audience(List.of("friend-on-campus-api"))
                .issuedAt(Instant.now().minusSeconds(1)).expiresAt(Instant.now().plusSeconds(60))
                .claim("username", user.getUsername()).claim("role", role).build();
        return encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(SignatureAlgorithm.RS256).keyId("user-service-rs256-1").build(), claims)).getTokenValue();
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
}
