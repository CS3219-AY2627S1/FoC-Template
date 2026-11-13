package sg.edu.nus.foc.order.security;

import java.util.Collection;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;

public final class FirebaseTokenValidators {
    public static final String GOOGLE_JWK_SET_URI =
            "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

    private FirebaseTokenValidators() {
    }

    public static OAuth2TokenValidator<Jwt> forProject(String projectId) {
        return new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer("https://securetoken.google.com/" + projectId),
                new JwtClaimValidator<Object>("aud", audience -> hasAudience(audience, projectId)),
                new JwtClaimValidator<String>("sub", subject -> subject != null && !subject.isBlank()));
    }

    static boolean hasAudience(Object audience, String projectId) {
        if (audience instanceof String single) {
            return single.equals(projectId);
        }
        return audience instanceof Collection<?> many && many.contains(projectId);
    }
}
