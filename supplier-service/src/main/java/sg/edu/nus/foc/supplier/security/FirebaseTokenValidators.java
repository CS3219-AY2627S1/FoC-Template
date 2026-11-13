package sg.edu.nus.foc.supplier.security;

import java.util.Collection;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;

/** Firebase ID token rules: https://firebase.google.com/docs/auth/admin/verify-id-tokens */
public final class FirebaseTokenValidators {

    public static final String GOOGLE_JWK_SET_URI =
            "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

    private FirebaseTokenValidators() {
    }

    public static String issuer(String projectId) {
        return "https://securetoken.google.com/" + projectId;
    }

    /** Expiry/not-before (with clock skew), issuer, audience and a non-empty subject. */
    public static OAuth2TokenValidator<Jwt> forProject(String projectId) {
        return new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer(projectId)),
                new JwtClaimValidator<Object>("aud", aud -> hasAudience(aud, projectId)),
                new JwtClaimValidator<String>("sub", sub -> sub != null && !sub.isBlank()));
    }

    /** {@code aud} is a single string in Firebase tokens; decoders may also normalise it to a list. */
    static boolean hasAudience(Object aud, String projectId) {
        if (aud instanceof String single) {
            return single.equals(projectId);
        }
        return aud instanceof Collection<?> many && many.contains(projectId);
    }
}
