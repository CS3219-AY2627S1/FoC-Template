package sg.edu.nus.foc.order.security;

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

/** Accepts Firebase Auth emulator's unsigned tokens only when emulator mode is configured. */
public class EmulatorJwtDecoder implements JwtDecoder {
    private final OAuth2TokenValidator<Jwt> validator;

    public EmulatorJwtDecoder(String projectId) {
        validator = FirebaseTokenValidators.forProject(projectId);
    }

    @Override
    public Jwt decode(String token) {
        JWT parsed;
        JWTClaimsSet claims;
        try {
            parsed = JWTParser.parse(token);
            claims = parsed.getJWTClaimsSet();
        } catch (ParseException exception) {
            throw new BadJwtException("Malformed token", exception);
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
                    .headers(values -> values.putAll(headers))
                    .claims(values -> values.putAll(claimMap))
                    .audience(claims.getAudience())
                    .issuedAt(issuedAt == null ? null : issuedAt.toInstant())
                    .expiresAt(expiresAt.toInstant())
                    .build();
        } catch (IllegalArgumentException exception) {
            throw new BadJwtException("Invalid token: " + exception.getMessage(), exception);
        }
        OAuth2TokenValidatorResult result = validator.validate(jwt);
        if (result.hasErrors()) {
            throw new JwtValidationException("Invalid emulator token", result.getErrors());
        }
        return jwt;
    }
}
