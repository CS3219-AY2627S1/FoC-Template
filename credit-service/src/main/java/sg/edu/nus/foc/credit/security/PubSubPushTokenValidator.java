/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-08
 * Mode: Code generation.
 * Scope: Handle order pub/sub push token validator. 
 * Author review: I reviewed for correctness and edited where needed.
 */

package sg.edu.nus.foc.credit.security;

import java.util.Set;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.credit.config.CreditPushProperties;

final class PubSubPushTokenValidator implements OAuth2TokenValidator<Jwt> {

    private static final Set<String> GOOGLE_ISSUERS = Set.of(
            "accounts.google.com", "https://accounts.google.com");
    private static final OAuth2Error INVALID_TOKEN = new OAuth2Error(
            "invalid_token", "Pub/Sub push token claims are invalid.", null);

    private final CreditPushProperties properties;

    PubSubPushTokenValidator(CreditPushProperties properties) {
        this.properties = properties;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        String issuer = token.getClaimAsString("iss");
        String email = token.getClaimAsString("email");
        Object emailVerified = token.getClaim("email_verified");
        boolean verified = Boolean.TRUE.equals(emailVerified) || "true".equals(emailVerified);
        if (!GOOGLE_ISSUERS.contains(issuer)
                || !token.getAudience().contains(properties.audience())
                || !properties.serviceAccount().equals(email)
                || !verified) {
            return OAuth2TokenValidatorResult.failure(INVALID_TOKEN);
        }
        return OAuth2TokenValidatorResult.success();
    }
}
