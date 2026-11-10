/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation implementation.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.text.Normalizer;
import java.util.HexFormat;
import java.util.List;

public final class ReportSubmissionFingerprint {
    private static final String VERSION = "report-submission-v1";

    private ReportSubmissionFingerprint() { }

    public static String normalizeDescription(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value.replace("\r\n", "\n").replace('\r', '\n'),
                Normalizer.Form.NFC).strip();
    }

    public static String create(String callerId, ReportCategory category, String orderId,
                                String description, List<AttachmentInput> attachments) {
        var canonical = new StringBuilder(VERSION).append('\n')
                .append(field(callerId)).append('\n')
                .append(category == null ? "" : category.name()).append('\n')
                .append(field(orderId)).append('\n')
                .append(normalizeDescription(description)).append('\n');
        for (AttachmentInput item : attachments) {
            canonical.append(item.index()).append('\t').append(field(item.filename())).append('\t')
                    .append(item.size()).append('\t').append(field(item.contentType())).append('\t')
                    .append(item.sha256()).append('\n');
        }
        return sha256(canonical.toString().getBytes(StandardCharsets.UTF_8));
    }

    public static String attachmentId(int index, String sha256) {
        if (index < 0 || sha256 == null || !sha256.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("Invalid attachment identity.");
        }
        return index + "-" + sha256;
    }

    public static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("SHA-256 is unavailable.", impossible);
        }
    }

    private static String field(String value) { return value == null ? "" : value; }

    public record AttachmentInput(int index, String filename, long size,
                                  String contentType, String sha256) { }
}
