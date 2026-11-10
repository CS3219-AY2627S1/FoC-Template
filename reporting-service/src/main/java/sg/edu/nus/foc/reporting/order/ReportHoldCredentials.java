package sg.edu.nus.foc.reporting.order;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.IdTokenCredentials;
import com.google.auth.oauth2.IdTokenProvider;
import java.io.IOException;
import java.util.List;
import java.util.function.Function;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;

/** ADC uses the attached runtime identity; no service-account key or browser token is minted. */
@Component
public class ReportHoldCredentials implements Supplier<String> {
    public static final String HEADER = "X-Reporting-Service-Authorization";
    private final String mode;
    private final String audience;
    private final String localCredential;
    private final Function<String, IdTokenCredentials> factory;
    private IdTokenCredentials credentials;

    @Autowired public ReportHoldCredentials(
            @Value("${REPORT_ORDER_HOLD_AUTH_MODE:google}") String mode,
            @Value("${REPORT_ORDER_HOLD_AUDIENCE:${ORDER_SERVICE_URL:http://localhost:8083}}") String audience,
            @Value("${REPORT_HOLD_LOCAL_CREDENTIAL:}") String localCredential,
            @Value("${FOC_ENVIRONMENT:local}") String environment, ReportingProperties properties) {
        this(mode, audience, localCredential, environment, properties.auth().projectId(),
                properties.auth().emulatorHost(), ReportHoldCredentials::createCredentials);
    }
    ReportHoldCredentials(String mode, String audience, String localCredential, String environment,
                          String authProject, String authEmulator, Function<String, IdTokenCredentials> factory) {
        this.mode = mode; this.audience = audience; this.localCredential = localCredential; this.factory = factory;
        if (!"google".equals(mode) && !"local".equals(mode)) throw new IllegalStateException("Invalid Report hold authentication mode.");
        if ("local".equals(mode) && (!"local".equals(environment) || !authProject.startsWith("demo-")
                || authEmulator.isBlank() || localCredential.length() < 32)) {
            throw new IllegalStateException("Local Report hold credentials require local demo Firebase emulators and a development credential.");
        }
    }
    @Override public synchronized String get() {
        if ("local".equals(mode)) return "Local " + localCredential;
        if (!audience.startsWith("https://")) throw new DependencyUnavailableException("Order service identity audience is not configured.");
        try {
            if (credentials == null) credentials = factory.apply(audience);
            credentials.refreshIfExpired();
            if (credentials.getAccessToken() == null) throw new IOException("No service identity token returned.");
            return "Bearer " + credentials.getAccessToken().getTokenValue();
        } catch (IOException failure) {
            throw new DependencyUnavailableException("Reporting service authentication is temporarily unavailable.", failure);
        }
    }
    private static IdTokenCredentials createCredentials(String audience) {
        try {
            GoogleCredentials source = GoogleCredentials.getApplicationDefault();
            if (!(source instanceof IdTokenProvider provider)) throw new IOException("Runtime credentials do not support service ID tokens.");
            return IdTokenCredentials.newBuilder().setIdTokenProvider(provider).setTargetAudience(audience)
                    .setOptions(List.of(IdTokenProvider.Option.FORMAT_FULL)).build();
        } catch (IOException failure) {
            throw new DependencyUnavailableException("Reporting service identity could not be obtained.", failure);
        }
    }
}
