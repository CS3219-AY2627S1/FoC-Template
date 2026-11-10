/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class ReportSubmissionFingerprintTest {
    @Test
    void normalizesDescriptionAndIncludesOrderedAttachmentHashes() {
        var first = new ReportSubmissionFingerprint.AttachmentInput(0, "proof.png", 8,
                "image/png", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
        var second = new ReportSubmissionFingerprint.AttachmentInput(1, "other.png", 9,
                "image/png", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

        String left = ReportSubmissionFingerprint.create("caller", ReportCategory.ORDER,
                "order", "  damaged\r\nitem  ", List.of(first, second));
        String right = ReportSubmissionFingerprint.create("caller", ReportCategory.ORDER,
                "order", "damaged\nitem", List.of(first, second));

        assertEquals(right, left);
        assertNotEquals(left, ReportSubmissionFingerprint.create("caller", ReportCategory.ORDER,
                "order", "damaged\nitem", List.of(second, first)));
    }

    @Test
    void deterministicAttachmentIdentityUsesIndexAndSha256() {
        String sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        assertEquals("0-" + sha, ReportSubmissionFingerprint.attachmentId(0, sha));
        assertEquals("9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
                ReportSubmissionFingerprint.sha256(new byte[] {1, 2, 3, 4}));
    }
}
