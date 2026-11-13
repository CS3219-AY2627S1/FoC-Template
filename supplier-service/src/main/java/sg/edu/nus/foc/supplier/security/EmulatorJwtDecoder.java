package sg.edu.nus.foc.supplier.security;

import java.text.ParseException;
import java.util.Date;
import java.util.Map;

import com.nimbusds.jwt.JWT;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.JWTParser;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;

/**
 * Decodes tokens issued by the Firebase Auth <em>emulator</em>, which are unsigned ({@code alg: none}).
 * Only created when {@code FIREBASE_AUTH_EMULATOR_HOST} is set (local compose and tests); the
 * same issuer/audience/expiry rules as production still apply.
 */
public class EmulatorJwtDecoder implements JwtDecoder {

    private final OAuth2TokenValidator<Jwt> validator;

    public EmulatorJwtDecoder(String projectId) {
        this.validator = FirebaseTokenValidators.forProject(projectId);
    }

    @Override
    public Jwt decode(String token) {
        JWT parsed;
        JWTClaimsSet claims;
        try {
            parsed = JWTParser.parse(token);
            claims = parsed.getJWTClaimsSet();
        } catch (ParseException e) {
            throw new BadJwtException("Malformed token", e);
        }
        Map<String, Object> headers = parsed.getHeader().toJSONObject();
        Map<String, Object> claimMap = claims.toJSONObject();
        Date issuedAt = claims.getIssueTime();
        Date expiresAt = claims.getExpirationTime();
        if (claimMap.isEmpty() || expiresAt == null) {
            throw new BadJwtException("Token has no claims or no expiry");
        }

        Jwt jwt;
        try {
            jwt = Jwt.withTokenValue(token)
                    .headers(h -> h.putAll(headers))
                    .claims(c -> c.putAll(claimMap))
                    // Normalise like NimbusJwtDecoder does, so both decoders produce identical Jwt objects.
                    .audience(claims.getAudience())
                    .issuedAt(issuedAt != null ? issuedAt.toInstant() : null)
                    .expiresAt(expiresAt.toInstant())
                    .build();
        } catch (IllegalArgumentException e) {
            // e.g. expiry before issue time: a bad token (401), not a server error.
            throw new BadJwtException("Invalid token: " + e.getMessage(), e);
        }

        OAuth2TokenValidatorResult result = validator.validate(jwt);
        if (result.hasErrors()) {
            throw new JwtValidationException("Invalid emulator token", result.getErrors());
        }
        return jwt;
    }
}
