/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.order.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.order.config.ReportCreationSettings;

/** Exact Google OIDC identity required for report-creation compensation pushes. */
public final class ReportCreationPushTokenValidator implements OAuth2TokenValidator<Jwt> {
    private final ReportCreationSettings settings;

    public ReportCreationPushTokenValidator(ReportCreationSettings settings) {
        this.settings = settings;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt token) {
        Object verified = token.getClaim("email_verified");
        String issuer = token.getClaimAsString("iss");
        if (!("accounts.google.com".equals(issuer) || "https://accounts.google.com".equals(issuer))
                || !token.getAudience().contains(settings.audience())
                || !settings.account().equals(token.getClaimAsString("email"))
                || !(Boolean.TRUE.equals(verified) || "true".equals(verified))) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token", "Invalid report creation compensation identity.", null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
