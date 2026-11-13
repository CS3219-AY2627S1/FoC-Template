package sg.edu.nus.foc.order.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class FirebaseTokenValidatorsTest {
    @Test
    void matchesFirebaseProjectAudienceAsStringOrCollection() {
        assertTrue(FirebaseTokenValidators.hasAudience("demo-foc", "demo-foc"));
        assertTrue(FirebaseTokenValidators.hasAudience(java.util.List.of("other", "demo-foc"), "demo-foc"));
        assertFalse(FirebaseTokenValidators.hasAudience("other", "demo-foc"));
        assertFalse(FirebaseTokenValidators.hasAudience(java.util.List.of("other"), "demo-foc"));
        assertFalse(FirebaseTokenValidators.hasAudience(null, "demo-foc"));
    }
}
