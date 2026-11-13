package com.friendoncampus.credit.integration;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.util.*;
import org.junit.jupiter.api.*;

class AdminActorClientTest {
    HttpServer server;AdminActorClient client;final UUID actor=UUID.randomUUID();int status;String body;boolean verified;
    @BeforeEach void setup()throws Exception{
        var generator=KeyPairGenerator.getInstance("RSA");generator.initialize(2048);var keys=generator.generateKeyPair();status=200;body="{\"userId\":\""+actor+"\",\"active\":true,\"roles\":[\"ADMIN\"]}";
        server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/",request->{
            try{var jwt=SignedJWT.parse(request.getRequestHeaders().getFirst("Authorization").substring(7));verified=jwt.verify(new RSASSAVerifier((RSAPublicKey)keys.getPublic()))&&"credit-service".equals(jwt.getJWTClaimsSet().getSubject())&&jwt.getJWTClaimsSet().getAudience().contains("user-service");}
            catch(Exception ex){verified=false;}
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);request.sendResponseHeaders(status,bytes.length);try(var out=request.getResponseBody()){out.write(bytes);}
        });server.start();client=new AdminActorClient(new com.friendoncampus.credit.authorization.CurrentAuthorization(URI.create("http://127.0.0.1:"+server.getAddress().getPort()),"credit-test",Base64.getEncoder().encodeToString(keys.getPrivate().getEncoded())));
    }
    @AfterEach void close(){server.stop(0);}
    @Test void usesItsOwnAudienceBoundServiceIdentityAndValidatesTheReturnedUser(){
        assertTrue(client.eligible(actor));assertTrue(verified);body=body.replace(actor.toString(),UUID.randomUUID().toString());assertThrows(IllegalStateException.class,()->client.eligible(actor));
    }
    @Test void distinguishesActorDenialFromDependencyFailure(){
        body=body.replace("\"active\":true","\"active\":false");assertFalse(client.eligible(actor));status=404;assertFalse(client.eligible(actor));status=503;assertThrows(IllegalStateException.class,()->client.eligible(actor));
    }
}
