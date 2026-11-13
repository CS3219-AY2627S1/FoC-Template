package com.friendoncampus.user.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.security.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import com.friendoncampus.user.config.ServiceTokens;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:eligibility;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password="})
@AutoConfigureMockMvc
class AdminEligibilitySecurityTest {
    static final KeyPair keys = keys();
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    static KeyPair keys() { try { var g = KeyPairGenerator.getInstance("RSA"); g.initialize(2048); return g.generateKeyPair(); } catch(Exception ex) { throw new IllegalStateException(ex); } }
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        JwtTestProperties.register(r);
        r.add("USER_SERVICE_TRUSTED_KEYS", () -> "{\"admin-test\":{\"subject\":\"admin-service\",\"publicKey\":\"" + Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()) + "\"},\"supplier-test\":{\"subject\":\"supplier-service\",\"publicKey\":\"" + Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()) + "\"}}");
    }
    String token(String subject) {
        return new ServiceTokens(subject, subject, subject.equals("supplier-service")?"supplier-test":"admin-test", Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded()), "{}").issue("user-service");
    }
    @Test void reportsPersistedEligibilityAndReflectsRevocation() throws Exception {
        User user = User.register("eligibility@u.nus.edu", "Eligibility", "eligibility", "hash");
        user.activate(); user.promoteToAdmin(); users.save(user);
        String path = "/internal/users/" + user.getId() + "/admin-eligibility";
        mvc.perform(get(path).header("Authorization", "Bearer " + token("admin-service"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.userId").value(user.getId().toString())).andExpect(jsonPath("$.active").value(true)).andExpect(jsonPath("$.administrator").value(true));
        user.demoteToUser(); users.save(user);
        mvc.perform(get(path).header("Authorization", "Bearer " + token("admin-service"))).andExpect(status().isOk()).andExpect(jsonPath("$.administrator").value(false));
        user.ban(); users.save(user);
        mvc.perform(get(path).header("Authorization", "Bearer " + token("admin-service"))).andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
    }
    @Test void generalAuthorizationReturnsCurrentAssignmentsWithoutCaching() throws Exception {
        User user=User.bootstrapAdmin("auth-"+UUID.randomUUID()+"@u.nus.edu","Auth","auth"+UUID.randomUUID().toString().substring(0,8),"hash");
        user.activate();users.save(user);String path="/internal/users/"+user.getId()+"/authorization";
        mvc.perform(get(path).header("Authorization","Bearer "+token("admin-service"))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.roles").value(org.hamcrest.Matchers.hasItems("REQUESTER","ADMIN")));
        user.demoteToUser();user.ban();users.save(user);
        mvc.perform(get(path).header("Authorization","Bearer "+token("admin-service"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false)).andExpect(jsonPath("$.roles").value(org.hamcrest.Matchers.hasSize(1))).andExpect(jsonPath("$.roles[0]").value("REQUESTER"));
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization","Bearer malformed")).andExpect(status().isUnauthorized());
    }
    @Test void supplierIdentityIsLimitedToGeneralAuthorization() throws Exception {
        String authorization="Bearer "+token("supplier-service");
        mvc.perform(get("/internal/users/"+UUID.randomUUID()+"/authorization").header("Authorization",authorization)).andExpect(status().isNotFound());
        mvc.perform(get("/internal/users/"+UUID.randomUUID()+"/admin-eligibility").header("Authorization",authorization)).andExpect(status().isForbidden());
        mvc.perform(get("/internal/users/admin-operations/"+UUID.randomUUID()).header("Authorization",authorization)).andExpect(status().isForbidden());
    }
    @Test void deniesAnonymousUntrustedAndWrongSubjectAndHidesMissingAccount() throws Exception {
        String path = "/internal/users/" + UUID.randomUUID() + "/admin-eligibility";
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization", "Bearer malformed")).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization", "Bearer " + token("chat-service"))).andExpect(status().isUnauthorized());
        mvc.perform(get(path).header("Authorization", "Bearer " + token("admin-service"))).andExpect(status().isNotFound());
    }
}
