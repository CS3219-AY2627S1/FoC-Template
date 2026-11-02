/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.config;

import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReportingPropertiesTest {
    @Test void suppliesSafeDefaultsForMissingAndInvalidSettings() {
        var properties = new ReportingProperties(null, null, null, null, null, null);
        assertEquals("demo-foc", properties.firestore().projectId()); assertEquals("reporting-local", properties.firestore().databaseId());
        assertEquals("demo-foc-reporting-local", properties.storage().bucket()); assertFalse(properties.auth().usesEmulator());
        assertEquals(ReportingProperties.Mode.MOCK, properties.userService().mode()); assertEquals(Duration.ofSeconds(3), properties.userService().timeout());
        assertEquals(Duration.ofSeconds(30), properties.userService().roleCacheTtl()); assertEquals(Duration.ofSeconds(5), properties.orderService().timeout());
        assertTrue(properties.corsOrigins().isEmpty());
        var invalid = new ReportingProperties.UserService(null, null, null, Duration.ZERO, Duration.ofSeconds(-1));
        assertEquals(Duration.ofSeconds(3), invalid.timeout()); assertEquals(Duration.ofSeconds(30), invalid.roleCacheTtl());
        assertEquals(Duration.ofSeconds(5), new ReportingProperties.OrderService("http://orders", Duration.ZERO).timeout());
    }

    @Test void trimsAndPreservesExplicitConfiguration() {
        var properties = new ReportingProperties(new ReportingProperties.Firestore(" p ", " db ", " host "),
                new ReportingProperties.Storage(" p ", " bucket ", " http://storage "), new ReportingProperties.Auth(" p ", " auth "),
                new ReportingProperties.UserService(ReportingProperties.Mode.HTTP, " http://users ", List.of("a"), Duration.ofSeconds(2), Duration.ZERO),
                new ReportingProperties.OrderService(" http://orders ", Duration.ofSeconds(4)), List.of("http://ui"));
        assertEquals("p", properties.firestore().projectId()); assertEquals("host", properties.firestore().emulatorHost());
        assertEquals("bucket", properties.storage().bucket()); assertTrue(properties.auth().usesEmulator());
        assertEquals("http://users", properties.userService().baseUrl()); assertEquals(Duration.ZERO, properties.userService().roleCacheTtl());
        assertEquals("http://orders", properties.orderService().baseUrl()); assertEquals(List.of("http://ui"), properties.corsOrigins());
    }
}
