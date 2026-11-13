package com.friendoncampus.credit.authorization;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import java.net.*;
import java.security.*;
import java.security.interfaces.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.*;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationProvider;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;

/** Real pre-revocation RS256 bearer tokens and authenticated User HTTP calls. */
class CurrentAuthorizationBoundaryTest {
    HttpServer user;
    KeyPair identity,service;
    UUID actor=UUID.randomUUID(),other=UUID.randomUUID();
    AtomicBoolean active=new AtomicBoolean(true),assigned=new AtomicBoolean(true);
    AtomicInteger dependency=new AtomicInteger(200),calls=new AtomicInteger();
    AtomicReference<String> payloadOverride=new AtomicReference<>();
    CurrentAuthorization current;
    BearerTokenAuthenticationFilter bearer;
    @BeforeEach void setup() throws Exception {
        var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);
        identity=generator.generateKeyPair();service=generator.generateKeyPair();
        user=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        user.createContext("/internal/users/",request -> {
            calls.incrementAndGet();int status=dependency.get();
            try {
                SignedJWT assertion=SignedJWT.parse(request.getRequestHeaders().getFirst("Authorization").substring(7));
                var claims=assertion.getJWTClaimsSet();
                if(!assertion.verify(new RSASSAVerifier((RSAPublicKey)service.getPublic()))
                        || !"credit-service".equals(claims.getSubject()) || !claims.getAudience().equals(List.of("user-service"))
                        || !"foc-service-auth".equals(claims.getIssuer()) || claims.getJWTID()==null
                        || claims.getExpirationTime().getTime()-claims.getIssueTime().getTime()>60000) status=401;
            } catch(Exception ex) { status=401; }
            String path=request.getRequestURI().getPath();
            boolean own=path.contains(actor.toString());
            UUID id=own?actor:other;
            String body="{\"userId\":\""+id+"\",\"active\":"+(!own||active.get())+",\"roles\":"
                    +(own&&!assigned.get()?"[\"REQUESTER\"]":"[\"REQUESTER\",\"ADMIN\"]")+"}";
            if(!path.equals("/internal/users/"+id+"/authorization"))status=404;
            if(payloadOverride.get()!=null)body=payloadOverride.get();
            byte[] bytes=body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            request.sendResponseHeaders(status,bytes.length);try(var out=request.getResponseBody()){out.write(bytes);}
        });user.start();
        current=new CurrentAuthorization(URI.create("http://127.0.0.1:"+user.getAddress().getPort()),"test-service",
                Base64.getEncoder().encodeToString(service.getPrivate().getEncoded()));
        var decoder=NimbusJwtDecoder.withPublicKey((RSAPublicKey)identity.getPublic()).build();
        decoder.setJwtValidator(new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer("test-user"),jwt -> jwt.getAudience().contains("test-api")
                ? org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.success()
                : org.springframework.security.oauth2.core.OAuth2TokenValidatorResult.failure(new org.springframework.security.oauth2.core.OAuth2Error("invalid_token"))));
        bearer=new BearerTokenAuthenticationFilter(new ProviderManager(new JwtAuthenticationProvider(decoder)));
    }
    @AfterEach void stop() { user.stop(0);SecurityContextHolder.clearContext(); }
    String token(UUID id,String role,Instant expires) throws Exception {
        SignedJWT token=new SignedJWT(new JWSHeader(JWSAlgorithm.RS256),new JWTClaimsSet.Builder()
                .issuer("test-user").audience("test-api").subject(id.toString()).claim("role",role)
                .issueTime(Date.from(expires.isBefore(Instant.now())?expires.minusSeconds(60):Instant.now().minusSeconds(1))).expirationTime(Date.from(expires)).build());
        token.sign(new RSASSASigner((RSAPrivateKey)identity.getPrivate()));return token.serialize();
    }
    int request(String raw,boolean resourceAllowed) throws Exception {
        SecurityContextHolder.clearContext();
        var req=new MockHttpServletRequest("GET","/api/credits/me");req.setServletPath("/api/credits/me");
        req.addHeader("Authorization","Bearer "+raw);var res=new MockHttpServletResponse();
        bearer.doFilter(req,res,(q,r)->new CurrentAuthorizationFilter(current).doFilter(q,r,
                (accepted,response)->((jakarta.servlet.http.HttpServletResponse)response).setStatus(resourceAllowed?204:403)));
        return res.getStatus();
    }
    @Test void tokenIssuedBeforeBanIsDeniedWhileOtherUsersAndResourceChecksRemainIndependent() throws Exception {
        String old=token(actor,"ADMIN",Instant.now().plusSeconds(300));
        String unaffected=token(other,"ADMIN",Instant.now().plusSeconds(300));
        assertEquals(204,request(old,true));assertEquals(403,request(old,false));
        active.set(false);assertEquals(403,request(old,true));assertEquals(204,request(unaffected,true));
        active.set(true);assertEquals(204,request(old,true));
    }
    @Test void selectedRoleRemovalDoesNotRemoveTheRemainingRequesterPermission() throws Exception {
        String admin=token(actor,"ADMIN",Instant.now().plusSeconds(300));
        String requester=token(actor,"REQUESTER",Instant.now().plusSeconds(300));
        assertEquals(204,request(admin,true));assigned.set(false);
        assertEquals(403,request(admin,true));assertEquals(204,request(requester,true));
    }
    @Test void outagesNeverReuseSuccessAndRecoveryUsesCurrentState() throws Exception {
        String old=token(actor,"ADMIN",Instant.now().plusSeconds(300));
        assertEquals(204,request(old,true));dependency.set(503);assertEquals(503,request(old,true));
        dependency.set(200);active.set(false);assertEquals(403,request(old,true));
        active.set(true);assertEquals(204,request(old,true));assertEquals(4,calls.get());
    }
    @Test void malformedAndMismatchedUserResponsesNeverGrantAccess() throws Exception {
        String before=token(actor,"ADMIN",Instant.now().plusSeconds(300));
        for(String body:List.of("{}","{\"userId\":\""+actor+"\",\"active\":true,\"roles\":[\"ADMIN\",\"ADMIN\"]}",
                "{\"userId\":\""+other+"\",\"active\":true,\"roles\":[\"ADMIN\"]}")) {
            payloadOverride.set(body);assertEquals(503,request(before,true));
        }
        payloadOverride.set(null);dependency.set(404);assertEquals(403,request(before,true));
        dependency.set(200);assertEquals(204,request(before,true));
    }
    @Test void userTransportFailureFailsClosedAfterEarlierSuccess() throws Exception {
        String before=token(actor,"ADMIN",Instant.now().plusSeconds(300));
        assertEquals(204,request(before,true));user.stop(0);assertEquals(503,request(before,true));
    }
    @Test void invalidAndExpiredTokensCannotUseCurrentAuthorizationAsAuthentication() throws Exception {
        assertEquals(401,request("invalid",true));
        assertEquals(401,request(token(actor,"ADMIN",Instant.now().minusSeconds(120)),true));
        assertEquals(0,calls.get());
    }
}
