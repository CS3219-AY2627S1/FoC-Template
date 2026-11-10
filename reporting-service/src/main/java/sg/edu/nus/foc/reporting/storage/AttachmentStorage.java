/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.storage;

public interface AttachmentStorage {
    void put(String objectKey, String contentType, byte[] bytes);
    default void putDeterministic(String objectKey, String contentType, byte[] bytes, String sha256) {
        try {
            StoredObject existing = get(objectKey);
            if (!contentType.equals(existing.contentType())
                    || !sha256.equals(sg.edu.nus.foc.reporting.report.ReportSubmissionFingerprint.sha256(existing.bytes()))) {
                throw new sg.edu.nus.foc.reporting.error.ConflictException("Stored evidence does not match the submission manifest.");
            }
        } catch (sg.edu.nus.foc.reporting.error.NotFoundException missing) {
            put(objectKey, contentType, bytes);
        }
    }
    StoredObject get(String objectKey);
    void delete(String objectKey);
}
