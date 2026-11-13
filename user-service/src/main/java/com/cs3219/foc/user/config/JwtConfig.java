package com.cs3219.foc.user.config;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.proc.SecurityContext;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;

@Configuration
public class JwtConfig {

    @Bean
    ECKey signingKey(AuthProperties properties) {
        try {
            var privatePem = properties.privateKeyLocation().getContentAsString(StandardCharsets.UTF_8);

            var publicPem = properties.publicKeyLocation().getContentAsString(StandardCharsets.UTF_8);

            var parsedKey = JWK.parseFromPEMEncodedObjects(privatePem + System.lineSeparator() + publicPem)
                    .toECKey();

            return new ECKey.Builder(Curve.P_256, parsedKey.toECPublicKey())
                    .privateKey(parsedKey.toECPrivateKey())
                    .algorithm(JWSAlgorithm.ES256)
                    .keyID(properties.keyId())
                    .build();

        } catch (IOException | JOSEException e) {
            throw new IllegalStateException("Unable to load JWT signing key", e);
        }
    }

    @Bean
    JWKSource<SecurityContext> jwkSource(ECKey signingKey) {
        return new ImmutableJWKSet<>(new JWKSet(signingKey));
    }

    @Bean
    JWKSet publicJwkSet(ECKey signingKey) {
        return new JWKSet(signingKey.toPublicJWK());
    }

    @Bean
    JwtEncoder jwtEncoder(JWKSource<SecurityContext> jwkSource) {
        return new NimbusJwtEncoder(jwkSource);
    }

    @Bean
    JwtDecoder jwtDecoder(JWKSource<SecurityContext> jwkSource) {
        return NimbusJwtDecoder.withJwkSource(jwkSource)
                .jwsAlgorithm(SignatureAlgorithm.ES256)
                .build();
    }

    @Bean
    JwtAuthenticationConverter jwtAuthenticationConverter() {
        var converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(this::extractAuthorities);
        return converter;
    }

    private Collection<GrantedAuthority> extractAuthorities(Jwt jwt) {
        var roles = jwt.getClaimAsStringList("roles");
        if (roles == null) {
            return List.of();
        }

        return roles.stream()
                .map(role -> "ROLE_" + role)
                .map(SimpleGrantedAuthority::new)
                .collect(Collectors.toList());
    }
}
