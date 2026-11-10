package sg.edu.nus.foc.order.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.order.config.ReportHoldSettings;
import sg.edu.nus.foc.order.domain.OrderProblem;

@Component
public class ReportHoldCallerVerifier {
    public static final String HEADER = "X-Reporting-Service-Authorization";
    private final ReportHoldSettings settings;
    private final JwtDecoder decoder;

    @Autowired public ReportHoldCallerVerifier(ReportHoldSettings settings) {
        this(settings, settings.local() ? null : googleDecoder(settings));
    }
    ReportHoldCallerVerifier(ReportHoldSettings settings, JwtDecoder decoder) {
        this.settings = settings; this.decoder = decoder;
    }
    private static JwtDecoder googleDecoder(ReportHoldSettings settings) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri("https://www.googleapis.com/oauth2/v3/certs").build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefault(), new ReportingServiceTokenValidator(settings)));
        return decoder;
    }
    public void requireReportingCall(String authorization) {
        if (settings.local()) {
            byte[] expected = ("Local " + settings.localCredential()).getBytes(StandardCharsets.UTF_8);
            if (authorization == null || !MessageDigest.isEqual(expected, authorization.getBytes(StandardCharsets.UTF_8))) throw unauthorized();
            return;
        }
        if (!settings.audience().startsWith("https://") || !settings.account().endsWith(".gserviceaccount.com")) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Reporting service authentication is not configured.");
        }
        if (authorization == null || !authorization.startsWith("Bearer ") || authorization.length() <= 7) throw unauthorized();
        try { decoder.decode(authorization.substring(7)); }
        catch (BadJwtException invalid) { throw unauthorized(); }
        catch (JwtException unavailable) { throw new OrderProblem("SERVICE_UNAVAILABLE", "Reporting identity verification is temporarily unavailable."); }
    }
    private static OrderProblem unauthorized() {
        return new OrderProblem("UNAUTHENTICATED", "A verified Reporting Service call is required to place a report hold.");
    }
}
