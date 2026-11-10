/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.storage;

import java.util.List;
import com.google.cloud.storage.Blob;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.NotFoundException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.report.ReportSubmissionFingerprint;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CloudStorageAttachmentStorageTest {
    private final Storage client = mock(Storage.class);
    private final CloudStorageAttachmentStorage storage = new CloudStorageAttachmentStorage(client,
            new ReportingProperties(null, new ReportingProperties.Storage("p", "private-bucket", ""), null, null, null, List.of()));

    @Test void storesAndReadsPrivateNoStoreObjects() {
        byte[] bytes = {1, 2, 3}; storage.put("reports/r/a", "image/png", bytes);
        verify(client).create(argThat(info -> info.getBucket().equals("private-bucket") && info.getName().equals("reports/r/a")
                && info.getContentType().equals("image/png") && info.getCacheControl().contains("no-store")), eq(bytes));
        Blob blob = mock(Blob.class); when(blob.exists()).thenReturn(true); when(blob.getContent()).thenReturn(bytes); when(blob.getContentType()).thenReturn("image/png");
        when(client.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(blob);
        StoredObject object = storage.get("reports/r/a"); assertArrayEquals(bytes, object.bytes()); assertEquals("image/png", object.contentType());
        storage.delete("reports/r/a"); verify(client).delete(any(com.google.cloud.storage.BlobId.class));
    }

    @Test void hidesMissingObjectsAndMapsReadWriteAndCleanupOutages() {
        when(client.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(null);
        assertThrows(NotFoundException.class, () -> storage.get("missing"));
        Blob missing = mock(Blob.class); when(missing.exists()).thenReturn(false); when(client.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(missing);
        assertThrows(NotFoundException.class, () -> storage.get("missing"));
        when(client.get(any(com.google.cloud.storage.BlobId.class))).thenThrow(new StorageException(500, "down"));
        assertThrows(DependencyUnavailableException.class, () -> storage.get("down"));
        doThrow(new StorageException(500, "down")).when(client).create(any(com.google.cloud.storage.BlobInfo.class), any(byte[].class));
        assertThrows(DependencyUnavailableException.class, () -> storage.put("key", "image/png", new byte[]{1}));
        when(client.delete(any(com.google.cloud.storage.BlobId.class))).thenThrow(new StorageException(500, "down"));
        assertThrows(DependencyUnavailableException.class, () -> storage.delete("key"));
    }

    @Test void deterministicPutCreatesOnceAndAcceptsOnlyMatchingExistingBytes() {
        byte[] bytes = {1, 2, 3};
        String sha = ReportSubmissionFingerprint.sha256(bytes);
        storage.putDeterministic("reports/report/submission/0-" + sha, "image/png", bytes, sha);
        verify(client).create(argThat(info -> sha.equals(info.getMetadata().get("sha256"))),
                eq(bytes), any(Storage.BlobTargetOption[].class));

        reset(client);
        when(client.create(any(), eq(bytes), any(Storage.BlobTargetOption[].class)))
                .thenThrow(new StorageException(412, "exists"));
        Blob matching = mock(Blob.class);
        when(matching.getContentType()).thenReturn("image/png");
        when(matching.getSize()).thenReturn(3L);
        when(matching.getMetadata()).thenReturn(java.util.Map.of("sha256", sha));
        when(matching.getContent()).thenReturn(bytes);
        when(client.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(null, matching);
        assertDoesNotThrow(() -> storage.putDeterministic("same", "image/png", bytes, sha));

        when(client.get(any(com.google.cloud.storage.BlobId.class))).thenReturn(matching);
        when(matching.getContent()).thenReturn(new byte[]{9, 9, 9});
        assertThrows(ConflictException.class,
                () -> storage.putDeterministic("same", "image/png", bytes, sha));
    }
}
