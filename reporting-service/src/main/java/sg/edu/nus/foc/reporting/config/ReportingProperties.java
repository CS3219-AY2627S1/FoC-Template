/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.config;

import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("foc.reporting")
public record ReportingProperties(Firestore firestore, Storage storage, Auth auth,
                                  UserService userService, OrderService orderService,
                                  List<String> corsOrigins) {
    public ReportingProperties {
        firestore = firestore == null ? new Firestore(null, null, null) : firestore;
        storage = storage == null ? new Storage(null, null, null) : storage;
        auth = auth == null ? new Auth(null, null) : auth;
        userService = userService == null ? new UserService(null, null, null, null, null) : userService;
        orderService = orderService == null ? new OrderService(null, null) : orderService;
        corsOrigins = corsOrigins == null ? List.of() : List.copyOf(corsOrigins);
    }

    public record Firestore(String projectId, String databaseId, String emulatorHost) {
        public Firestore { projectId = value(projectId, "demo-foc"); databaseId = value(databaseId, "reporting-local"); emulatorHost = value(emulatorHost, ""); }
    }
    public record Storage(String projectId, String bucket, String emulatorHost) {
        public Storage { projectId = value(projectId, "demo-foc"); bucket = value(bucket, "demo-foc-reporting-local"); emulatorHost = value(emulatorHost, ""); }
    }
    public record Auth(String projectId, String emulatorHost) {
        public Auth { projectId = value(projectId, "demo-foc"); emulatorHost = value(emulatorHost, ""); }
        public boolean usesEmulator() { return !emulatorHost.isEmpty(); }
    }
    public record UserService(Mode mode, String baseUrl, List<String> mockAdminEmails, Duration timeout, Duration roleCacheTtl) {
        public UserService {
            mode = mode == null ? Mode.MOCK : mode;
            baseUrl = value(baseUrl, "");
            mockAdminEmails = mockAdminEmails == null ? List.of() : List.copyOf(mockAdminEmails);
            timeout = timeout == null || !timeout.isPositive() ? Duration.ofSeconds(3) : timeout;
            roleCacheTtl = roleCacheTtl == null || roleCacheTtl.isNegative() ? Duration.ofSeconds(30) : roleCacheTtl;
        }
    }
    public record OrderService(String baseUrl, Duration timeout) {
        public OrderService { baseUrl = value(baseUrl, "http://localhost:8083"); timeout = timeout == null || !timeout.isPositive() ? Duration.ofSeconds(5) : timeout; }
    }
    public enum Mode { MOCK, HTTP }
    private static String value(String input, String fallback) { return input == null || input.isBlank() ? fallback : input.trim(); }
}
