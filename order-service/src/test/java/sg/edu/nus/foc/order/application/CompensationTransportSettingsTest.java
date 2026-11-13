package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;
import sg.edu.nus.foc.order.security.CompensationPushTokenValidator;

class CompensationTransportSettingsTest {
    @Test void localUnsignedPushRequiresEveryEmulatorBoundary() {
        assertTrue(settings("emulator", "local", "demo-local", "emulator", "localhost:8085",
                "demo-auth", "localhost:9099").emulator());
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "staging",
                "demo-local", "emulator", "localhost:8085", "demo-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "local",
                "real-project", "emulator", "localhost:8085", "demo-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "local",
                "demo-local", "emulator", "localhost:8085", "demo-auth", ""));
        assertThrows(IllegalArgumentException.class, () -> settings("google", "staging",
                "real-project", "cloud", "localhost:8085", "real-auth", ""));
        assertThrows(IllegalArgumentException.class, () -> settings("other", "local",
                "demo-local", "emulator", "localhost:8085", "demo-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "local",
                "demo-local", "emulator", "", "demo-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "local",
                "demo-local", "cloud", "localhost:8085", "demo-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("emulator", "local",
                "demo-local", "emulator", "localhost:8085", "real-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("google", "staging",
                "real-project", "cloud", "", "real-auth", "localhost:9099"));
        assertThrows(IllegalArgumentException.class, () -> settings("google", "staging",
                "demo-local", "cloud", "", "real-auth", ""));
        assertThrows(IllegalArgumentException.class, () -> new CompensationTransportSettings(
                "", "results", "google", "", "", "project", "cloud", "", "staging", "auth", ""));
        assertThrows(IllegalArgumentException.class, () -> new CompensationTransportSettings(
                "projects/p/topics/t", "results", "google", "", "", "project", "cloud", "", "staging", "auth", ""));
        assertThrows(IllegalArgumentException.class, () -> new CompensationTransportSettings(
                "requests", "results", "google", "", "", "project", "cloud", "", "staging", "auth", ""));
    }

    @Test void googleIdentityRequiresIssuerAudienceAndVerifiedExactEmail() {
        CompensationTransportSettings config = settings("google", "staging",
                "real-project", "cloud", "", "real-auth", "");
        CompensationPushTokenValidator validator = new CompensationPushTokenValidator(config);
        Jwt valid = jwt("https://accounts.google.com", "https://order.example",
                "push@project.iam.gserviceaccount.com", true);
        assertFalse(validator.validate(valid).hasErrors());
        assertTrue(validator.validate(jwt("https://securetoken.google.com/auth",
                "https://order.example", "push@project.iam.gserviceaccount.com", true)).hasErrors());
        assertTrue(validator.validate(jwt("https://accounts.google.com", "wrong",
                "push@project.iam.gserviceaccount.com", true)).hasErrors());
        assertTrue(validator.validate(jwt("https://accounts.google.com", "https://order.example",
                "other@project.iam.gserviceaccount.com", true)).hasErrors());
        assertTrue(validator.validate(jwt("https://accounts.google.com", "https://order.example",
                "push@project.iam.gserviceaccount.com", false)).hasErrors());
    }

    private static CompensationTransportSettings settings(String mode, String environment,
            String project, String messagingMode, String broker, String authProject, String authHost) {
        return new CompensationTransportSettings("requests", "results", mode,
                "https://order.example", "push@project.iam.gserviceaccount.com",
                project, messagingMode, broker, environment, authProject, authHost);
    }

    private static Jwt jwt(String issuer, String audience, String email, boolean verified) {
        return Jwt.withTokenValue("test").header("alg", "RS256").issuer(issuer)
                .audience(java.util.List.of(audience)).claim("email", email)
                .claim("email_verified", verified).build();
    }
}
