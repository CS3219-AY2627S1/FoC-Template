package com.friendoncampus.user.config;

import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateCrtKey;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;

@Configuration
@EnableConfigurationProperties(JwtProperties.class)
public class JwtConfiguration {

    @Bean
    RSAKey signingJwk(JwtProperties properties) {
        try {
            RSAPrivateKey privateKey = (RSAPrivateKey) KeyFactory.getInstance("RSA")
                    .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(properties.privateKey())));
            if (!(privateKey instanceof RSAPrivateCrtKey privateCrtKey)) {
                throw new IllegalStateException("JWT private key must contain RSA public-key parameters");
            }
            RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                    privateCrtKey.getModulus(), privateCrtKey.getPublicExponent()));
            return new RSAKey.Builder(publicKey).privateKey(privateKey).keyID(properties.keyId()).build();
        } catch (Exception exception) {
            throw new IllegalStateException("JWT_PRIVATE_KEY must be a Base64-encoded PKCS#8 RSA private key", exception);
        }
    }

    @Bean
    JwtEncoder jwtEncoder(RSAKey signingJwk) {
        return new NimbusJwtEncoder(new ImmutableJWKSet<>(new JWKSet(signingJwk)));
    }

    @Bean
    JwtDecoder jwtDecoder(RSAKey signingJwk, JwtProperties properties) {
        try {
            NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(signingJwk.toRSAPublicKey()).build();
            OAuth2TokenValidator<Jwt> audienceValidator = jwt -> jwt.getAudience().contains(properties.audience())
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid token audience", null));
            decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer(properties.issuer()), audienceValidator, jwt -> {
                        try {
                            java.util.UUID.fromString(jwt.getSubject());
                            com.friendoncampus.user.domain.UserRole.valueOf(jwt.getClaimAsString("role"));
                            return OAuth2TokenValidatorResult.success();
                        } catch(RuntimeException ex) {
                            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Invalid actor claims",null));
                        }
                    }));
            return decoder;
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to configure JWT decoder", exception);
        }
    }
}
