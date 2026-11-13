/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Code generation.
 * Scope: Generated the security implementation from the team-finalized Firebase authentication, authorization, and CORS design.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.security;

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
        } catch (ParseException e) {
            throw new BadJwtException("Malformed token", e);
        }
        Map<String, Object> claimMap = claims.toJSONObject();
        Date issuedAt = claims.getIssueTime();
        Date expiresAt = claims.getExpirationTime();
        if (claimMap.isEmpty() || expiresAt == null) {
            throw new BadJwtException("Token has no claims or no expiry");
        }

        Jwt jwt;
        try {
            jwt = Jwt.withTokenValue(token)
                    .headers(headers -> headers.putAll(parsed.getHeader().toJSONObject()))
                    .claims(values -> values.putAll(claimMap))
                    .audience(claims.getAudience())
                    .issuedAt(issuedAt != null ? issuedAt.toInstant() : null)
                    .expiresAt(expiresAt.toInstant())
                    .build();
        } catch (IllegalArgumentException e) {
            throw new BadJwtException("Invalid token: " + e.getMessage(), e);
        }

        OAuth2TokenValidatorResult result = validator.validate(jwt);
        if (result.hasErrors()) {
            throw new JwtValidationException("Invalid emulator token", result.getErrors());
        }
        return jwt;
    }
}
