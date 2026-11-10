/* AI assistance: OpenAI Codex, 2026-11-02. Unified participant report response and legacy-upgrade regression tests; human review pending. */
package sg.edu.nus.foc.reporting.report;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import static org.junit.jupiter.api.Assertions.*;

class UnifiedOrderReportTest {
    private static final Instant NOW = Instant.parse("2026-11-02T10:00:00Z");
    private Report courierReport(ReportCategory category, ReportStatus status) {
        return new Report("r", "courier", category, "Nothing at pickup", "o", "courier", status,
                NOW.minusSeconds(100), category == ReportCategory.ORDER ? NOW.plusSeconds(86400) : null,
                null, null, null, List.of(), List.of(), null, null, "requester");
    }
    @Test void requesterRespondsToCourierComplaintAndReporterCannotReplyToItself() {
        Report report = courierReport(ReportCategory.ORDER, ReportStatus.AWAITING_COURIER_RESPONSE);
        assertEquals("requester", report.respondentId());
        assertTrue(report.participant("requester"));
        assertThrows(ForbiddenException.class, () -> report.respond("courier", "Self", NOW, List.of()));
        assertThrows(ForbiddenException.class, () -> report.respond("stranger", "No", NOW, List.of()));
        Report response = report.respond("requester", "Supplier moved it", NOW, List.of());
        assertEquals(ReportStatus.READY_FOR_REVIEW, response.status());
        assertEquals("Supplier moved it", response.courierResponse());
        assertThrows(ConflictException.class, () -> response.respond("requester", "Again", NOW, List.of()));
        assertThrows(ConflictException.class, () -> report.respond("requester", "Late", NOW.plusSeconds(86400), List.of()));
    }
    @Test void unresolvedErrandUpgradesOnceAndResolvedHistoryIsUntouched() {
        Report legacy = courierReport(ReportCategory.ERRAND, ReportStatus.READY_FOR_REVIEW);
        Report upgraded = legacy.reconcile(NOW);
        assertEquals(ReportCategory.ERRAND, upgraded.category());
        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE, upgraded.status());
        assertEquals(NOW.plusSeconds(86400), upgraded.responseDeadlineAt());
        assertEquals(upgraded, upgraded.reconcile(NOW.plusSeconds(60)));
        assertEquals(ReportStatus.READY_FOR_REVIEW, upgraded.reconcile(NOW.plusSeconds(86400)).status());
        Report resolved = courierReport(ReportCategory.ERRAND, ReportStatus.RESOLVED);
        assertEquals(resolved, resolved.reconcile(NOW));
    }

    @Test void newErrandKeepsItsDeadlineAndDoesNotReopenAfterRequesterResponse() {
        Report report = new Report("r", "courier", ReportCategory.ERRAND, "Pickup issue", "o", "courier",
                ReportStatus.AWAITING_COURIER_RESPONSE, NOW, NOW.plusSeconds(86400), null, null, null,
                List.of(), List.of(), null, null, "requester");
        assertEquals(report, report.reconcile(NOW.plusSeconds(60)));
        Report responded = report.respond("requester", "At counter", NOW.plusSeconds(60), List.of());
        assertEquals(responded, responded.reconcile(NOW.plusSeconds(120)));
        assertEquals(NOW.plusSeconds(86400), responded.responseDeadlineAt());
        assertEquals(ReportStatus.READY_FOR_REVIEW, report.reconcile(NOW.plusSeconds(86400)).status());
    }

    @Test void handlesLegacyConstructorParticipantAndResolutionBoundaries() {
        Report legacyOrder = new Report("r", "requester", ReportCategory.ORDER, "Issue", "o", "courier",
                ReportStatus.READY_FOR_REVIEW, NOW, null, null, null, null, null, null, null, null, null);
        assertEquals("requester", legacyOrder.requesterId());
        assertEquals("courier", legacyOrder.respondentId());
        assertTrue(legacyOrder.participant("requester"));
        assertTrue(legacyOrder.participant("courier"));
        assertFalse(legacyOrder.participant("other"));
        assertEquals(ReportStatus.RESOLVED, legacyOrder.resolved(NOW).status());
        assertEquals(ReportStatus.RESOLVED, legacyOrder.resolved(NOW).resolved(NOW.plusSeconds(1)).status());

        Report unlinked = new Report("u", "requester", ReportCategory.GENERAL, "Issue", null, null,
                ReportStatus.READY_FOR_REVIEW, NOW, null, null, null, null, List.of(), List.of());
        assertNull(unlinked.respondentId());
        assertFalse(unlinked.participant("other"));

        Report noCourier = new Report("n", "requester", ReportCategory.ORDER, "Issue", "o", null,
                ReportStatus.READY_FOR_REVIEW, NOW, null, null, null, null, List.of(), List.of());
        assertNull(noCourier.respondentId());

        Report notUpgradeable = new Report("e", "courier", ReportCategory.ERRAND, "Issue", "o", "other",
                ReportStatus.READY_FOR_REVIEW, NOW, null, null, null, null, List.of(), List.of(), null, null, "requester");
        assertSame(notUpgradeable, notUpgradeable.reconcile(NOW));
        Report alreadyResponded = new Report("e2", "courier", ReportCategory.ERRAND, "Issue", "o", "courier",
                ReportStatus.READY_FOR_REVIEW, NOW, null, "answer", NOW, null, List.of(), List.of(), null, null, "requester");
        assertSame(alreadyResponded, alreadyResponded.reconcile(NOW));

        Report missingRequester = new Report("e3", "courier", ReportCategory.ERRAND, "Issue", "o", "courier",
                ReportStatus.READY_FOR_REVIEW, NOW, null, null, null, null, List.of(), List.of(), null, null, null);
        assertSame(missingRequester, missingRequester.reconcile(NOW));
        Report awaitingWithoutDeadline = new Report("a", "requester", ReportCategory.ORDER, "Issue", "o", "courier",
                ReportStatus.AWAITING_COURIER_RESPONSE, NOW, null, null, null, null, List.of(), List.of());
        assertSame(awaitingWithoutDeadline, awaitingWithoutDeadline.reconcile(NOW));
        assertThrows(ForbiddenException.class, () -> legacyOrder.respond(null, "No", NOW, List.of()));
        assertThrows(ConflictException.class, () -> legacyOrder.respond("courier", "No", NOW, List.of()));
        Report reviewWithFutureDeadline = new Report("f", "requester", ReportCategory.ORDER, "Issue", "o", "courier",
                ReportStatus.READY_FOR_REVIEW, NOW, NOW.plusSeconds(60), null, null, null, List.of(), List.of());
        assertThrows(ConflictException.class, () -> reviewWithFutureDeadline.respond("courier", "No", NOW, List.of()));
    }
}
