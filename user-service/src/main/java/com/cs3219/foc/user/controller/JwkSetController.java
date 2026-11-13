package com.cs3219.foc.user.controller;

import com.nimbusds.jose.jwk.*;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class JwkSetController {
    private final JWKSet jwkSet;

    @GetMapping(value = "/.well-known/jwks.json", produces = "application/json")
    public Map<String, Object> jwks() {
        return jwkSet.toJSONObject();
    }
}
