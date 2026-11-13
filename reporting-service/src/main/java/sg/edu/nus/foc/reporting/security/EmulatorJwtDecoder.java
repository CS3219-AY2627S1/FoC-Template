/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.text.ParseException;
import java.util.Date;
import com.nimbusds.jwt.JWTParser;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;

class EmulatorJwtDecoder implements JwtDecoder {
    private final org.springframework.security.oauth2.core.OAuth2TokenValidator<Jwt> validator;
    EmulatorJwtDecoder(String projectId) { validator = FirebaseTokenValidators.forProject(projectId); }
    @Override public Jwt decode(String token) {
        try {
            var parsed = JWTParser.parse(token); var claims = parsed.getJWTClaimsSet(); Date expiry = claims.getExpirationTime();
            if (claims.toJSONObject().isEmpty() || expiry == null) throw new BadJwtException("Token has no claims or expiry");
            Jwt jwt = Jwt.withTokenValue(token).headers(headers -> headers.putAll(parsed.getHeader().toJSONObject()))
                    .claims(values -> values.putAll(claims.toJSONObject())).audience(claims.getAudience())
                    .issuedAt(claims.getIssueTime() == null ? null : claims.getIssueTime().toInstant()).expiresAt(expiry.toInstant()).build();
            var result = validator.validate(jwt);
            if (result.hasErrors()) throw new JwtValidationException("Invalid emulator token", result.getErrors());
            return jwt;
        } catch (ParseException | IllegalArgumentException e) { throw new BadJwtException("Malformed token", e); }
    }
}
