package com.friendoncampus.chat.authorization;

import java.net.URI;
import java.net.http.*;
import java.security.*;
import java.security.interfaces.RSAPrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.*;
import java.util.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Current User state, never cached. Call before acquiring application database locks. */
@Component
public class CurrentAuthorization {
    private final URI base;
    private final String kid, privateKey;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    public CurrentAuthorization(@Value("${app.user.base-url:http://localhost:8081}") URI base,
            @Value("${app.service-auth.key-id:}") String kid,
            @Value("${app.service-auth.private-key:}") String privateKey) {
        if (base.getHost() == null || !Set.of("http", "https").contains(base.getScheme())
                || base.getUserInfo() != null || base.getQuery() != null || base.getFragment() != null)
            throw new IllegalArgumentException("User URL must be HTTP(S) with a host");
        this.base=base; this.kid=kid; this.privateKey=privateKey;
    }
    public void require(Jwt jwt) {
        if (jwt.getExpiresAt()==null || !jwt.getExpiresAt().isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"A valid token is required");
        require(UUID.fromString(jwt.getSubject()),jwt.getClaimAsString("role"));
    }
    public void require(UUID actor, String role) {
        boolean allowed;
        try {
            Instant now=Instant.now();
            var key=(RSAPrivateKey)KeyFactory.getInstance("RSA").generatePrivate(
                    new PKCS8EncodedKeySpec(Base64.getDecoder().decode(privateKey)));
            if (kid.isBlank() || key.getModulus().bitLength()<2048) throw new IllegalStateException();
            var token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(kid).type(JOSEObjectType.JWT).build(),
                    new JWTClaimsSet.Builder().issuer("foc-service-auth").subject("chat-service").audience("user-service")
                    .issueTime(Date.from(now)).expirationTime(Date.from(now.plusSeconds(60))).jwtID(UUID.randomUUID().toString()).build());
            token.sign(new RSASSASigner(key));
            var response=http.send(HttpRequest.newBuilder(base.resolve("/internal/users/"+actor+"/authorization"))
                    .timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+token.serialize())
                    .header("Accept","application/json").GET().build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()==404) allowed=false;
            else {
                if(response.statusCode()!=200) throw new IllegalStateException();
                var data=JsonMapper.builder().build().readTree(response.body());
                if(!actor.toString().equals(data.path("userId").asText()) || !data.path("active").isBoolean()
                        || !data.path("roles").isArray()) throw new IllegalStateException();
                Set<String> roles=new HashSet<>();
                for(var value:data.path("roles")) {
                    if(!value.isString() || !Set.of("REQUESTER","COURIER","ADMIN").contains(value.asText())
                            || !roles.add(value.asText())) throw new IllegalStateException();
                }
                allowed=data.path("active").asBoolean() && roles.contains(role);
            }
        } catch(Exception ex) {
            if(ex instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Current account authorization unavailable");
        }
        if(!allowed) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Current account permission is required");
    }
}
