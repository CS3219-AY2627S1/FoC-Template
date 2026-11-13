package com.friendoncampus.user.web;

import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;

import io.swagger.v3.oas.annotations.Operation;

@RestController
public class JwksController {
    private final RSAKey signingJwk;

    public JwksController(RSAKey signingJwk) {
        this.signingJwk = signingJwk;
    }

    @GetMapping(value = "/.well-known/jwks.json", produces = MediaType.APPLICATION_JSON_VALUE)
    @Operation(summary = "Publish the User Service RS256 public key set")
    public Map<String, Object> keys() {
        return new JWKSet(signingJwk.toPublicJWK()).toJSONObject();
    }
}
