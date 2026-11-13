package sg.edu.nus.foc.supplier.config;

import java.time.Duration;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed configuration under {@code foc.supplier.*}; values come from environment variables (see application.yaml). */
@ConfigurationProperties("foc.supplier")
public record SupplierProperties(
        FirestoreSettings firestore,
        AuthSettings auth,
        UserServiceSettings userService,
        String seedFile,
        Duration cacheTtl,
        List<String> corsOrigins) {

    /** NFR5.3.2: supplier data shown to users may be at most 60 seconds stale. */
    public static final Duration MAX_CACHE_TTL = Duration.ofSeconds(60);

    public SupplierProperties {
        firestore = firestore != null ? firestore : new FirestoreSettings(null, null, null);
        auth = auth != null ? auth : new AuthSettings(null, null);
        userService = userService != null ? userService : new UserServiceSettings(null, null, null, null, null);
        seedFile = seedFile != null ? seedFile.trim() : "";
        if (cacheTtl == null || cacheTtl.isNegative() || cacheTtl.compareTo(MAX_CACHE_TTL) > 0) {
            cacheTtl = MAX_CACHE_TTL;
        }
        corsOrigins = corsOrigins != null ? List.copyOf(corsOrigins) : List.of();
    }

    public record FirestoreSettings(String projectId, String databaseId, String emulatorHost) {
        public FirestoreSettings {
            projectId = blankToDefault(projectId, "demo-foc");
            databaseId = blankToDefault(databaseId, "(default)");
            emulatorHost = emulatorHost != null ? emulatorHost.trim() : "";
        }
    }

    public record AuthSettings(String projectId, String emulatorHost) {
        public AuthSettings {
            projectId = blankToDefault(projectId, "demo-foc");
            emulatorHost = emulatorHost != null ? emulatorHost.trim() : "";
        }

        public boolean usesEmulator() {
            return !emulatorHost.isEmpty();
        }
    }

    /**
     * @param timeout      connect and read timeout for User Service calls; in the cloud it must cover a cold start
     * @param roleCacheTtl how long a user's roles are reused before asking the User Service again; 0 disables
     */
    public record UserServiceSettings(Mode mode, String baseUrl, List<String> mockAdminEmails, Duration timeout,
                                      Duration roleCacheTtl) {
        public UserServiceSettings {
            mode = mode != null ? mode : Mode.MOCK;
            baseUrl = baseUrl != null ? baseUrl.trim() : "";
            mockAdminEmails = mockAdminEmails != null ? List.copyOf(mockAdminEmails) : List.of();
            timeout = timeout != null && timeout.isPositive() ? timeout : Duration.ofSeconds(3);
            roleCacheTtl = roleCacheTtl != null && !roleCacheTtl.isNegative() ? roleCacheTtl : Duration.ofSeconds(30);
        }
    }

    /** How user roles are resolved: faked locally ({@code MOCK}) or fetched from the User Service ({@code HTTP}). */
    public enum Mode { MOCK, HTTP }

    private static String blankToDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
