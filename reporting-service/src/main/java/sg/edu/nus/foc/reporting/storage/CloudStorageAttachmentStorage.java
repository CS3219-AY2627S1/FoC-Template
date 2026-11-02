/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.storage;

import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageException;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.NotFoundException;

@Component
public class CloudStorageAttachmentStorage implements AttachmentStorage {
    private final Storage storage;
    private final String bucket;
    public CloudStorageAttachmentStorage(Storage storage, ReportingProperties properties) {
        this.storage = storage; this.bucket = properties.storage().bucket();
    }
    @Override public void put(String objectKey, String contentType, byte[] bytes) {
        try {
            storage.create(BlobInfo.newBuilder(BlobId.of(bucket, objectKey)).setContentType(contentType)
                    .setCacheControl("private, no-store, max-age=0").build(), bytes);
        } catch (StorageException e) { throw new DependencyUnavailableException("Attachment storage is unavailable.", e); }
    }
    @Override public StoredObject get(String objectKey) {
        try {
            var blob = storage.get(BlobId.of(bucket, objectKey));
            if (blob == null || !blob.exists()) throw new NotFoundException("Attachment not found.");
            return new StoredObject(blob.getContent(), blob.getContentType());
        } catch (NotFoundException e) { throw e; }
        catch (StorageException e) { throw new DependencyUnavailableException("Attachment storage is unavailable.", e); }
    }
    @Override public void delete(String objectKey) {
        try { storage.delete(BlobId.of(bucket, objectKey)); }
        catch (StorageException ignored) { /* best-effort rollback */ }
    }
}
