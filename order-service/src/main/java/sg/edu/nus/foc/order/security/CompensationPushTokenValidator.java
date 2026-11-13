package sg.edu.nus.foc.order.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;

/** Google push service identity, deliberately independent of Firebase user roles. */
public final class CompensationPushTokenValidator implements OAuth2TokenValidator<Jwt> {
    private final CompensationTransportSettings settings;
    public CompensationPushTokenValidator(CompensationTransportSettings settings) { this.settings = settings; }
    @Override public OAuth2TokenValidatorResult validate(Jwt token) {
        Object verified = token.getClaim("email_verified");
        String issuer = token.getClaimAsString("iss");
        if (!("accounts.google.com".equals(issuer) || "https://accounts.google.com".equals(issuer))
                || !token.getAudience().contains(settings.audience())
                || !settings.serviceAccount().equals(token.getClaimAsString("email"))
                || !(Boolean.TRUE.equals(verified) || "true".equals(verified))) {
            return OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token",
                    "Invalid compensation push identity.", null));
        }
        return OAuth2TokenValidatorResult.success();
    }
}
