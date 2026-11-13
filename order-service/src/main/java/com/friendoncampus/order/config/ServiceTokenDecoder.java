package com.friendoncampus.order.config;

import java.security.*;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.*;
import org.springframework.security.oauth2.jwt.*;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Pins both key and caller, with the same short-lived service profile as Admin/User/Chat. */
public final class ServiceTokenDecoder {
    private final JsonNode trusted;
    private final String audience;
    private final Set<String> allowed;
    public ServiceTokenDecoder(String audience,String trust){
        this(audience,trust,Set.of("chat-service"));
    }
    public ServiceTokenDecoder(String audience,String trust,Set<String> allowed){
        this.audience=audience;this.allowed=Set.copyOf(allowed);
        try{trusted=JsonMapper.builder().build().readTree(trust);if(!trusted.isObject())throw new IllegalArgumentException();}
        catch(Exception ex){throw new IllegalArgumentException("Invalid service trust");}
    }
    public Jwt decode(String raw){
        try{
            SignedJWT token=SignedJWT.parse(raw);String kid=token.getHeader().getKeyID();
            if(kid==null||!JWSAlgorithm.RS256.equals(token.getHeader().getAlgorithm()))throw new IllegalArgumentException();
            JsonNode pin=trusted.get(kid);if(pin==null)throw new IllegalArgumentException();
            var key=(RSAPublicKey)KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(pin.path("publicKey").asText())));
            if(key.getModulus().bitLength()<2048||!token.verify(new RSASSAVerifier(key)))throw new IllegalArgumentException();
            var c=token.getJWTClaimsSet();Instant now=Instant.now(),issued=c.getIssueTime().toInstant(),expires=c.getExpirationTime().toInstant();
            if(!"foc-service-auth".equals(c.getIssuer())||!allowed.contains(c.getSubject())||!c.getSubject().equals(pin.path("subject").asText())
                    ||!c.getAudience().contains(audience)||!expires.isAfter(now)||issued.isAfter(now.plusSeconds(5))||!expires.isAfter(issued)
                    ||expires.isAfter(issued.plusSeconds(60))||c.getJWTID()==null||c.getJWTID().isBlank()
                    ||c.getNotBeforeTime()!=null&&c.getNotBeforeTime().toInstant().isAfter(now))throw new IllegalArgumentException();
            return new Jwt(raw,issued,expires,token.getHeader().toJSONObject(),c.getClaims());
        }catch(Exception ex){throw new BadJwtException("Invalid service assertion");}
    }
}