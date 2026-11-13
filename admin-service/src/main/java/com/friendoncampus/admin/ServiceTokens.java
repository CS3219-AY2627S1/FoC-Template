package com.friendoncampus.admin;

import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Service keys are pinned to BOTH kid and subject, independently of User's JWKS. */
public final class ServiceTokens {
    private final String audience;
    private final String subject;
    private final String keyId;
    private final String privateKey;
    private final JsonNode trusted;

    public ServiceTokens(String audience, String subject, String keyId, String privateKey, String trustedJson) {
        this.audience = audience; this.subject = subject; this.keyId = keyId; this.privateKey = privateKey;
        try {
            trusted = JsonMapper.builder().build().readTree(trustedJson);
            if (!trusted.isObject()) throw new IllegalArgumentException();
        } catch (Exception ex) { throw new IllegalArgumentException("Service trust configuration must be a JSON object"); }
    }

    public Jwt decode(String raw, Set<String> allowed) {
        try {
            SignedJWT token = SignedJWT.parse(raw);
            String kid = token.getHeader().getKeyID();
            if (!JWSAlgorithm.RS256.equals(token.getHeader().getAlgorithm()) || kid == null) throw new IllegalArgumentException();
            JsonNode key = trusted.get(kid);
            if (key == null) throw new IllegalArgumentException();
            RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(
                    new X509EncodedKeySpec(Base64.getDecoder().decode(key.path("publicKey").asText())));
            if (publicKey.getModulus().bitLength() < 2048 || !token.verify(new RSASSAVerifier(publicKey))) throw new IllegalArgumentException();
            JWTClaimsSet c = token.getJWTClaimsSet();
            Instant now = Instant.now();
            Instant issued = c.getIssueTime().toInstant();
            Instant expires = c.getExpirationTime().toInstant();
            if (!"foc-service-auth".equals(c.getIssuer()) || !c.getAudience().contains(audience)
                    || !allowed.contains(c.getSubject()) || !c.getSubject().equals(key.path("subject").asText())
                    || c.getJWTID() == null || c.getJWTID().isBlank() || !expires.isAfter(now)
                    || issued.isAfter(now.plusSeconds(5)) || !expires.isAfter(issued)
                    || expires.isAfter(issued.plusSeconds(60))
                    || (c.getNotBeforeTime() != null && c.getNotBeforeTime().toInstant().isAfter(now))) throw new IllegalArgumentException();
            return new Jwt(raw, issued, expires, token.getHeader().toJSONObject(), c.getClaims());
        } catch (Exception ex) { throw new BadJwtException("Invalid service assertion"); }
    }

    public String issue(String destination) {
        try {
            Instant now = Instant.now();
            RSAPrivateKey key = (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(
                    new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKey)));
            if (key.getModulus().bitLength() < 2048 || keyId.isBlank()) throw new IllegalArgumentException();
            SignedJWT token = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).type(JOSEObjectType.JWT).keyID(keyId).build(),
                    new JWTClaimsSet.Builder().issuer("foc-service-auth").subject(subject).audience(destination)
                            .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60)))
                            .jwtID(UUID.randomUUID().toString()).build());
            token.sign(new RSASSASigner(key));
            return token.serialize();
        } catch (Exception ex) { throw new IllegalStateException("Service signing configuration unavailable"); }
    }
}
