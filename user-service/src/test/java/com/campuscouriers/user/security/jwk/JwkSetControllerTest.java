/*
 * AI Assistance Disclosure
 * Tool and date: Anthropic Claude (model unrecorded), 2026-09-18 to 2026-10-03
 * Scope (AI-23): Generated code and tests for the User Service endpoints, entities, validation and token handling I specified.
 * Usage log: AI_USAGE_LOG.md
 * Author review: Pending confirmation by Melodi Joy Halim.
 */

package com.campuscouriers.user.security.jwk;

import com.campuscouriers.user.security.access.JwtService;
import io.jsonwebtoken.Jwts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigInteger;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.PublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.util.Base64;
import java.util.UUID;

import static org.assertj.core.api.AssertionsForClassTypes.assertThatCode;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(JwkSetController.class)
@Import({com.campuscouriers.user.security.SecurityConfig.class, JwkSetControllerTest.TestKeyConfig.class})
public class JwkSetControllerTest {

    private static final KeyPair KEY_PAIR = Jwts.SIG.RS256.keyPair().build();

    @TestConfiguration
    static class TestKeyConfig {
        @Bean
        PublicKey publicKey() {
            return KEY_PAIR.getPublic();
        }
    }

    @Autowired
    private MockMvc mockMvc;
    @MockitoBean
    private JwtService jwtService;    // required by SecurityConfig's JwtAuthenticationFilter

    @Test
    void jwkSet_returns200WithAnRsaKey() throws Exception {
        mockMvc.perform(get("/.well-known/jwks.json"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.keys[0].kty").value("RSA"))
                .andExpect(jsonPath("$.keys[0].alg").value("RS256"));
    }

    @Test
    void jwkSet_publishesAUsableRsaPublicKey() throws Exception {
        JwkSetController controller = new JwkSetController(KEY_PAIR.getPublic(), "test-key-1");

        Jwk jwk = controller.jwkSet().keys().get(0);

        PublicKey reconstructed = KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(
                decodeBigInteger(jwk.n()), decodeBigInteger(jwk.e())));

        String token = Jwts.builder().subject(new UUID(0L, 42L).toString())
                .signWith(KEY_PAIR.getPrivate(), Jwts.SIG.RS256).compact();

        assertThatCode(() -> Jwts.parser().verifyWith(reconstructed).build().parseSignedClaims(token))
                .doesNotThrowAnyException();
    }

    private static BigInteger decodeBigInteger(String base64Url) {
        return new BigInteger(1, Base64.getUrlDecoder().decode(base64Url));
    }
}
