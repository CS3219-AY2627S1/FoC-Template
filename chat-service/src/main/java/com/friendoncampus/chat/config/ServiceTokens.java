package com.friendoncampus.chat.config;

import java.security.KeyFactory;
import java.security.interfaces.*;
import java.security.spec.*;
import java.time.Instant;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.*;
import com.nimbusds.jwt.*;
import org.springframework.security.oauth2.jwt.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Short-lived, audience-bound service assertions, independent of user JWTs. */
public final class ServiceTokens {
    private final String audience, subject, keyId, privateKey;
    private final JsonNode trusted;
    public ServiceTokens(String audience,String subject,String keyId,String privateKey,String trustedJson){
        this.audience=audience;this.subject=subject;this.keyId=keyId;this.privateKey=privateKey;
        try{trusted=JsonMapper.builder().build().readTree(trustedJson);if(!trusted.isObject())throw new IllegalArgumentException();}
        catch(Exception ex){throw new IllegalArgumentException("Service trust configuration must be a JSON object");}
    }
    public Jwt decode(String raw,Set<String> allowed){
        try{
            SignedJWT token=SignedJWT.parse(raw);String kid=token.getHeader().getKeyID();
            if(!JWSAlgorithm.RS256.equals(token.getHeader().getAlgorithm())||kid==null)throw new IllegalArgumentException();
            JsonNode entry=trusted.get(kid);if(entry==null)throw new IllegalArgumentException();
            RSAPublicKey key=(RSAPublicKey)KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(entry.path("publicKey").asText())));
            if(key.getModulus().bitLength()<2048||!token.verify(new RSASSAVerifier(key)))throw new IllegalArgumentException();
            JWTClaimsSet c=token.getJWTClaimsSet();Instant now=Instant.now(),issued=c.getIssueTime().toInstant(),expires=c.getExpirationTime().toInstant();
            if(!"foc-service-auth".equals(c.getIssuer())||!c.getAudience().contains(audience)||!allowed.contains(c.getSubject())
                    ||!c.getSubject().equals(entry.path("subject").asText())||c.getJWTID()==null||c.getJWTID().isBlank()
                    ||!expires.isAfter(now)||issued.isAfter(now.plusSeconds(5))||!expires.isAfter(issued)||expires.isAfter(issued.plusSeconds(60))
                    ||c.getNotBeforeTime()!=null&&c.getNotBeforeTime().toInstant().isAfter(now))throw new IllegalArgumentException();
            return new Jwt(raw,issued,expires,token.getHeader().toJSONObject(),c.getClaims());
        }catch(Exception ex){throw new BadJwtException("Invalid service assertion");}
    }
    public String issue(String destination){
        try{
            Instant now=Instant.now();RSAPrivateKey key=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKey)));
            SignedJWT token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).keyID(keyId).build(),
                    new JWTClaimsSet.Builder().issuer("foc-service-auth").subject(subject).audience(destination).issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60))).jwtID(UUID.randomUUID().toString()).build());
            token.sign(new RSASSASigner(key));return token.serialize();
        }catch(Exception ex){throw new IllegalStateException("Service signing configuration unavailable",ex);}
    }
}
