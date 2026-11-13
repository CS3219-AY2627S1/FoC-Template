/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.security;

import java.util.Collection;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;

final class FirebaseTokenValidators {
    static final String JWK_URI = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
    private FirebaseTokenValidators() { }
    static OAuth2TokenValidator<Jwt> forProject(String projectId) {
        return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer("https://securetoken.google.com/" + projectId),
                new JwtClaimValidator<Object>("aud", value -> value instanceof String single ? single.equals(projectId) : value instanceof Collection<?> many && many.contains(projectId)),
                new JwtClaimValidator<String>("sub", value -> value != null && !value.isBlank()));
    }
}
