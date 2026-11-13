package com.friendoncampus.user.web;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.http.*;
import java.security.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.*;
import org.testcontainers.postgresql.PostgreSQLContainer;
import com.friendoncampus.user.config.ServiceTokens;
import com.friendoncampus.user.support.JwtTestProperties;

/** Real HTTP and PostgreSQL, with generated test-only service identities. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class AdminOperationSecurityTest {
    @Container static PostgreSQLContainer postgres=new PostgreSQLContainer("postgres:16-alpine");
    static final KeyPair keys=keys();
    static KeyPair keys(){try{var g=KeyPairGenerator.getInstance("RSA");g.initialize(2048);return g.generateKeyPair();}catch(Exception ex){throw new IllegalStateException(ex);}}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
        JwtTestProperties.register(r);r.add("spring.datasource.url",postgres::getJdbcUrl);r.add("spring.datasource.username",postgres::getUsername);r.add("spring.datasource.password",postgres::getPassword);
        String publicKey=Base64.getEncoder().encodeToString(keys.getPublic().getEncoded());
        r.add("USER_SERVICE_TRUSTED_KEYS",()->"{\"chat-test\":{\"subject\":\"chat-service\",\"publicKey\":\""+publicKey+"\"},\"admin-test\":{\"subject\":\"admin-service\",\"publicKey\":\""+publicKey+"\"}}");
    }
    @LocalServerPort int port;
    @Autowired JdbcTemplate db;
    String token(String subject,String audience){return new ServiceTokens("user-service",subject,subject.equals("chat-service")?"chat-test":"admin-test",Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded()),"{}").issue(audience);}
    HttpResponse<String> read(UUID operation,String token)throws Exception{
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/internal/users/admin-operations/"+operation)).GET();
        if(token!=null)request.header("Authorization","Bearer "+token);
        return HttpClient.newHttpClient().send(request.build(),HttpResponse.BodyHandlers.ofString());
    }
    @Test void returnsOnlyAnOriginalRecordedOutcomeAndDistinguishesAbsentFromUnavailable()throws Exception{
        UUID operation=UUID.randomUUID();String payload="{\"eventId\":\""+UUID.randomUUID()+"\",\"data\":{\"operationId\":\""+operation+"\",\"result\":\"APPLIED\"}}";
        db.update("INSERT INTO user_sanction_operations(operation_id,request_hash,outcome_event_id,target_user_id,payload) VALUES (?,'TEST ONLY',?,?,?)",operation,UUID.randomUUID(),UUID.randomUUID(),payload);
        var response=read(operation,token("chat-service","user-service"));assertEquals(200,response.statusCode());assertEquals(payload,response.body());assertEquals("no-store",response.headers().firstValue("Cache-Control").orElseThrow());
        assertEquals(404,read(UUID.randomUUID(),token("chat-service","user-service")).statusCode());
    }
    @Test void deniesAnonymousWrongAudienceAndAnotherTrustedService()throws Exception{
        UUID operation=UUID.randomUUID();assertEquals(401,read(operation,null).statusCode());assertEquals(401,read(operation,token("chat-service","wrong-service")).statusCode());
        assertEquals(403,read(operation,token("admin-service","user-service")).statusCode());
    }
}
