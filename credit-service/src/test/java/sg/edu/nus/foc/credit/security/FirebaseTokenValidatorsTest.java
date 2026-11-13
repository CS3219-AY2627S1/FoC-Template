/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Test generation and testing assistance.
 * Scope: Generated initial tests for the team-finalized Firebase and Spring Security behavior.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.List;

import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;

class FirebaseTokenValidatorsTest {

    private static final String PROJECT = "demo-foc";

    @Test
    void acceptsStringAndCollectionAudience() {
        assertThat(FirebaseTokenValidators.hasAudience(PROJECT, PROJECT)).isTrue();
        assertThat(FirebaseTokenValidators.hasAudience(List.of("other", PROJECT), PROJECT)).isTrue();
        assertThat(FirebaseTokenValidators.hasAudience("other", PROJECT)).isFalse();
        assertThat(FirebaseTokenValidators.hasAudience(123, PROJECT)).isFalse();
        assertThat(FirebaseTokenValidators.issuer(PROJECT)).endsWith(PROJECT);
    }

    @Test
    void emulatorDecoderAcceptsValidTokenAndRejectsMalformedOrIncompleteToken() {
        EmulatorJwtDecoder decoder = new EmulatorJwtDecoder(PROJECT);
        Instant now = Instant.now();
        Jwt decoded = decoder.decode(token(now.minusSeconds(1), now.plusSeconds(300), PROJECT, "user-1"));
        assertThat(decoded.getSubject()).isEqualTo("user-1");
        assertThatThrownBy(() -> decoder.decode("not-a-token")).isInstanceOf(BadJwtException.class);
        assertThatThrownBy(() -> decoder.decode(token(now, null, PROJECT, "user-1")))
                .isInstanceOf(BadJwtException.class);
    }

    @Test
    void emulatorDecoderRejectsWrongAudienceAndInvalidTimes() {
        EmulatorJwtDecoder decoder = new EmulatorJwtDecoder(PROJECT);
        Instant now = Instant.now();
        assertThatThrownBy(() -> decoder.decode(token(now.minusSeconds(1), now.plusSeconds(300), "other", "u")))
                .isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> decoder.decode(token(now.plusSeconds(300), now, PROJECT, "u")))
                .isInstanceOf(BadJwtException.class);
    }

    private static String token(Instant issuedAt, Instant expiresAt, String audience, String subject) {
        try {
            JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                    .issuer(FirebaseTokenValidators.issuer(PROJECT))
                    .audience(audience)
                    .subject(subject);
            if (issuedAt != null) {
                claims.issueTime(java.util.Date.from(issuedAt));
            }
            if (expiresAt != null) {
                claims.expirationTime(java.util.Date.from(expiresAt));
            }
            return new PlainJWT(claims.build()).serialize();
        } catch (Exception exception) {
            throw new IllegalStateException(exception);
        }
    }
}
