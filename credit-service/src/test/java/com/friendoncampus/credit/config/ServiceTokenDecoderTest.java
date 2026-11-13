package com.friendoncampus.credit.config;

import static org.junit.jupiter.api.Assertions.*;
import java.security.*;
import java.time.*;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;

class ServiceTokenDecoderTest {
    static final KeyPair keys=keys();
    static KeyPair keys(){try{var g=KeyPairGenerator.getInstance("RSA");g.initialize(2048);return g.generateKeyPair();}catch(Exception ex){throw new IllegalStateException(ex);}}
    ServiceTokenDecoder decoder(){return new ServiceTokenDecoder("credit-service","{\"chat-test\":{\"subject\":\"chat-service\",\"publicKey\":\""+Base64.getEncoder().encodeToString(keys.getPublic().getEncoded())+"\"}}");}
    String token(String subject,String audience,Instant issued,Instant expires,Instant notBefore,String id)throws Exception{
        var claims=new JWTClaimsSet.Builder().issuer("foc-service-auth").subject(subject).audience(audience).issueTime(Date.from(issued)).expirationTime(Date.from(expires)).jwtID(id);
        if(notBefore!=null)claims.notBeforeTime(Date.from(notBefore));
        var token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("chat-test").build(),claims.build());
        token.sign(new RSASSASigner(keys.getPrivate()));return token.serialize();
    }
    @Test void acceptsOnlyThePinnedChatIdentityAndDestination()throws Exception{
        Instant now=Instant.now();assertEquals("chat-service",decoder().decode(token("chat-service","credit-service",now,now.plusSeconds(60),null,"test")).getSubject());
        assertThrows(BadJwtException.class,()->decoder().decode(token("admin-service","credit-service",now,now.plusSeconds(60),null,"test")));
        assertThrows(BadJwtException.class,()->decoder().decode(token("chat-service","another-service",now,now.plusSeconds(60),null,"test")));
    }
    @Test void rejectsFutureNotYetValidOverlongAndMissingOperationIdentityAssertions()throws Exception{
        Instant now=Instant.now();
        assertThrows(BadJwtException.class,()->decoder().decode(token("chat-service","credit-service",now.plusSeconds(10),now.plusSeconds(60),null,"test")));
        assertThrows(BadJwtException.class,()->decoder().decode(token("chat-service","credit-service",now,now.plusSeconds(60),now.plusSeconds(10),"test")));
        assertThrows(BadJwtException.class,()->decoder().decode(token("chat-service","credit-service",now,now.plusSeconds(61),null,"test")));
        assertThrows(BadJwtException.class,()->decoder().decode(token("chat-service","credit-service",now,now.plusSeconds(60),null,"")));
    }
}