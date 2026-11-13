package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Instant;
import java.util.Date;
import org.junit.jupiter.api.Test;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidationException;

class EmulatorJwtDecoderTest {
    private final EmulatorJwtDecoder decoder = new EmulatorJwtDecoder("demo-foc");

    @Test
    void acceptsOnlyAnUnexpiredTokenForTheConfiguredFirebaseProject() {
        Jwt jwt = decoder.decode(token("https://securetoken.google.com/demo-foc", "demo-foc",
                Instant.now().plusSeconds(3600), "user-1"));

        assertEquals("user-1", jwt.getSubject());
        assertEquals(java.util.List.of("demo-foc"), jwt.getAudience());
    }

    @Test
    void rejectsWrongIssuerAudienceExpirySubjectAndMalformedInput() {
        Instant later = Instant.now().plusSeconds(3600);
        assertThrows(JwtValidationException.class, () -> decoder.decode(token(
                "https://securetoken.google.com/other", "demo-foc", later, "user")));
        assertThrows(JwtValidationException.class, () -> decoder.decode(token(
                "https://securetoken.google.com/demo-foc", "other", later, "user")));
        assertThrows(JwtValidationException.class, () -> decoder.decode(token(
                "https://securetoken.google.com/demo-foc", "demo-foc", Instant.now().minusSeconds(3600), "user")));
        assertThrows(JwtValidationException.class, () -> decoder.decode(token(
                "https://securetoken.google.com/demo-foc", "demo-foc", later, " ")));
        assertThrows(BadJwtException.class, () -> decoder.decode("not-a-jwt"));
        assertThrows(BadJwtException.class, () -> decoder.decode(new PlainJWT(new JWTClaimsSet.Builder()
                .issuer("https://securetoken.google.com/demo-foc")
                .audience("demo-foc")
                .subject("user")
                .build()).serialize()));
    }

    private String token(String issuer, String audience, Instant expiry, String subject) {
        Instant issuedAt = expiry.isBefore(Instant.now()) ? expiry.minusSeconds(3600) : Instant.now().minusSeconds(10);
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(issuer)
                .audience(audience)
                .subject(subject)
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(expiry))
                .build();
        return new PlainJWT(claims).serialize();
    }
}
