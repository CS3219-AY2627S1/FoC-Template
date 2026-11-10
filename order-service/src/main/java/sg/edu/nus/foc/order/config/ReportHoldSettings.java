package sg.edu.nus.foc.order.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** Service proof is independent of the delegated Firebase participant token. */
@Component
public record ReportHoldSettings(String mode, String audience, String account, String localCredential) {
    @Autowired public ReportHoldSettings(
            @Value("${ORDER_REPORT_HOLD_AUTH_MODE:google}") String mode,
            @Value("${ORDER_REPORT_HOLD_AUDIENCE:}") String audience,
            @Value("${ORDER_REPORT_HOLD_CALLER_SERVICE_ACCOUNT:}") String account,
            @Value("${REPORT_HOLD_LOCAL_CREDENTIAL:}") String localCredential,
            @Value("${FOC_ENVIRONMENT:local}") String environment,
            @Value("${order.security.auth.project-id:}") String authProject,
            @Value("${order.security.auth.emulator-host:}") String authEmulator) {
        this(mode, audience, account, localCredential);
        if (!"google".equals(mode) && !"local".equals(mode)) throw new IllegalStateException("Invalid Report hold authentication mode.");
        if (local() && (!"local".equals(environment) || !authProject.startsWith("demo-")
                || authEmulator.isBlank() || localCredential.length() < 32)) {
            throw new IllegalStateException("Local Report hold credentials require local demo Firebase emulators and a development credential.");
        }
    }
    public boolean local() { return "local".equals(mode); }
}
