package sg.edu.nus.foc.order.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.order.config.ReportHoldSettings;

public final class ReportingServiceTokenValidator implements OAuth2TokenValidator<Jwt> {
    private final ReportHoldSettings settings;
    public ReportingServiceTokenValidator(ReportHoldSettings settings) { this.settings = settings; }
    @Override public OAuth2TokenValidatorResult validate(Jwt token) {
        String issuer = token.getClaimAsString("iss");
        var audience = token.getAudience();
        Object verified = token.getClaim("email_verified");
        if (!("https://accounts.google.com".equals(issuer) || "accounts.google.com".equals(issuer))
                || audience == null || !audience.contains(settings.audience())
                || !settings.account().equals(token.getClaimAsString("email"))
                || !(Boolean.TRUE.equals(verified) || "true".equals(verified))
                || token.getSubject() == null || token.getSubject().isBlank()
                || token.getIssuedAt() == null || token.getExpiresAt() == null) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Reporting service identity is required.", null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
