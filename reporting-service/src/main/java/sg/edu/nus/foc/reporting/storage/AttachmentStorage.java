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
    StoredObject get(String objectKey);
    void delete(String objectKey);
}
