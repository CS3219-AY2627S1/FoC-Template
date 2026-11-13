package sg.edu.nus.foc.supplier.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidationException;

class EmulatorJwtDecoderTest {

    private final EmulatorJwtDecoder decoder = new EmulatorJwtDecoder("demo-foc");

    private static String token(String issuer, String audience, Instant expiry, String subject) {
        Instant issued = expiry != null && expiry.isBefore(Instant.now()) ? expiry.minusSeconds(3600)
                : Instant.now().minusSeconds(10);
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience(audience)
                .subject(subject)
                .claim("email", "student@u.nus.edu")
                .issueTime(Date.from(issued));
        if (expiry != null) {
            claims.expirationTime(Date.from(expiry));
        }
        return new PlainJWT(claims.build()).serialize();
    }

    @Test
    void acceptsAValidEmulatorToken() {
        Jwt jwt = decoder.decode(token("https://securetoken.google.com/demo-foc", "demo-foc",
                Instant.now().plusSeconds(3600), "uid-1"));
        assertThat(jwt.getSubject()).isEqualTo("uid-1");
        assertThat(jwt.getAudience()).isEqualTo(List.of("demo-foc"));
        assertThat(jwt.getClaimAsString("email")).isEqualTo("student@u.nus.edu");
    }

    @Test
    void rejectsWrongIssuerAudienceExpiryOrSubject() {
        Instant later = Instant.now().plusSeconds(3600);
        assertThatThrownBy(() -> decoder.decode(token("https://securetoken.google.com/other", "demo-foc", later, "u")))
                .isInstanceOf(JwtValidationException.class);
        assertThatThrownBy(() -> decoder.decode(token("https://securetoken.google.com/demo-foc", "other", later, "u")))
                .isInstanceOf(JwtValidationException.class);
        assertThatThrownBy(() -> decoder.decode(token("https://securetoken.google.com/demo-foc", "demo-foc",
                Instant.now().minusSeconds(3600), "u"))).isInstanceOf(JwtValidationException.class);
        assertThatThrownBy(() -> decoder.decode(token("https://securetoken.google.com/demo-foc", "demo-foc", later, " ")))
                .isInstanceOf(JwtValidationException.class);
    }

    @Test
    void rejectsTokensThatExpireBeforeTheyWereIssued() {
        String token = new PlainJWT(new JWTClaimsSet.Builder()
                .issuer("https://securetoken.google.com/demo-foc").audience("demo-foc").subject("u")
                .issueTime(Date.from(Instant.now().plusSeconds(7200)))
                .expirationTime(Date.from(Instant.now().plusSeconds(3600)))
                .build()).serialize();
        assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(BadJwtException.class);
    }

    @Test
    void rejectsMalformedOrExpiryLessTokens() {
        assertThatThrownBy(() -> decoder.decode("not-a-jwt")).isInstanceOf(BadJwtException.class);
        assertThatThrownBy(() -> decoder.decode(token("https://securetoken.google.com/demo-foc", "demo-foc", null, "u")))
                .isInstanceOf(BadJwtException.class);
    }

    @Test
    void audienceCheckAcceptsStringOrList() {
        assertThat(FirebaseTokenValidators.hasAudience("demo-foc", "demo-foc")).isTrue();
        assertThat(FirebaseTokenValidators.hasAudience(List.of("x", "demo-foc"), "demo-foc")).isTrue();
        assertThat(FirebaseTokenValidators.hasAudience(List.of("x"), "demo-foc")).isFalse();
        assertThat(FirebaseTokenValidators.hasAudience(null, "demo-foc")).isFalse();
    }
}
