package com.friendoncampus.user.web;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.repository.UserRepository;
import com.friendoncampus.user.support.JwtTestProperties;

/** Real servlet dispatch: MockMvc alone cannot detect a protected /error rewriting a 400. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,properties={
    "spring.datasource.url=jdbc:h2:mem:lifecyclehttp;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
    "spring.datasource.driver-class-name=org.h2.Driver","spring.datasource.username=sa","spring.datasource.password="})
class AdminLifecycleHttpTest {
    @LocalServerPort int port;
    @Autowired UserRepository users;
    @Autowired JwtEncoder encoder;
    @DynamicPropertySource static void keys(DynamicPropertyRegistry r){JwtTestProperties.register(r);}
    @Test void missingReactivationReasonIsA400ProblemThroughTheActualHttpServer() throws Exception {
        User actor=User.register("http-admin@u.nus.edu","HttpAdmin","httpadmin","hash");actor.activate();actor.promoteToAdmin();users.save(actor);
        User target=User.register("http-target@u.nus.edu","HttpTarget","httptarget","hash");target.activate();target.ban();users.save(target);
        var claims=JwtClaimsSet.builder().issuer("friend-on-campus-user-service").subject(actor.getId().toString())
            .audience(List.of("friend-on-campus-api")).issuedAt(Instant.now().minusSeconds(1)).expiresAt(Instant.now().plusSeconds(120)).claim("role","ADMIN").build();
        String token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(SignatureAlgorithm.RS256).keyId("user-service-rs256-1").build(),claims)).getTokenValue();
        var request=HttpRequest.newBuilder(URI.create("http://localhost:"+port+"/api/users/admin/accounts/"+target.getId()+"/status"))
            .header("Authorization","Bearer "+token).header("Content-Type","application/json")
            .method("PATCH",HttpRequest.BodyPublishers.ofString("{\"status\":\"ACTIVE\"}")).build();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        assertEquals(400,response.statusCode());assertTrue(response.headers().firstValue("content-type").orElse("").startsWith("application/problem+json"));
        assertTrue(response.body().contains("Reactivation requires a reason"));
        assertEquals(com.friendoncampus.user.domain.UserStatus.BANNED,users.findById(target.getId()).orElseThrow().getStatus());
    }
}
