/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex, date: 2026-11-10
 * Mode: Test generation and verification.
 * Scope: Added branch coverage for report-creation compensation dispatch and push validation.
 * Author review: User reviewed.
 */
package sg.edu.nus.foc.reporting.storage;

import static org.junit.jupiter.api.Assertions.*;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.NotFoundException;
import sg.edu.nus.foc.reporting.report.ReportSubmissionFingerprint;

class AttachmentStorageContractTest {
    @Test
    void deterministicPutCreatesMissingObjectsAcceptsExactReplaysAndRejectsMismatches() {
        MemoryStorage storage = new MemoryStorage();
        byte[] bytes = {1, 2, 3};
        String sha = ReportSubmissionFingerprint.sha256(bytes);

        storage.putDeterministic("key", "image/png", bytes, sha);
        assertArrayEquals(bytes, storage.get("key").bytes());
        assertDoesNotThrow(() -> storage.putDeterministic("key", "image/png", bytes, sha));
        assertThrows(ConflictException.class,
                () -> storage.putDeterministic("key", "image/jpeg", bytes, sha));
        assertThrows(ConflictException.class,
                () -> storage.putDeterministic("key", "image/png", bytes, ReportSubmissionFingerprint.sha256(new byte[]{9})));
    }

    private static final class MemoryStorage implements AttachmentStorage {
        private final Map<String, StoredObject> objects = new HashMap<>();
        @Override public void put(String key, String type, byte[] bytes) { objects.put(key, new StoredObject(bytes, type)); }
        @Override public StoredObject get(String key) {
            if (!objects.containsKey(key)) throw new NotFoundException("missing");
            return objects.get(key);
        }
        @Override public void delete(String key) { objects.remove(key); }
    }
}
