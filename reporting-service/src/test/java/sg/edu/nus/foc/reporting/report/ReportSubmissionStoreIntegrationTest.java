/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-10
 * Mode: Implementation.
 * Scope: Generated durable report-creation compensation tests.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import static org.junit.jupiter.api.Assertions.*;

import com.google.cloud.firestore.Firestore;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import sg.edu.nus.foc.reporting.creation.CreationCompensationMessages;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.support.FirestoreEmulator;
import tools.jackson.databind.json.JsonMapper;

class ReportSubmissionStoreIntegrationTest {
    private static final String DATABASE = "report-creation-submission-tests";
    private static final Instant START = Instant.parse("2026-11-10T00:00:00Z");
    private static Firestore db;

    @BeforeAll static void connect() { db = FirestoreEmulator.client(DATABASE); }
    @AfterAll static void close() throws Exception { db.close(); }
    @BeforeEach void clear() { FirestoreEmulator.clear(DATABASE); }

    private ReportSubmissionStore at(Instant instant) {
        return new ReportSubmissionStore(db, Clock.fixed(instant, ZoneOffset.UTC), JsonMapper.builder().build());
    }

    @Test
    void identicalBeginKeepsReportIdWhileDifferentFingerprintConflictsAndReservationIsOccupied() {
        String submission = UUID.randomUUID().toString();
        var store = at(START);
        var first = store.begin(submission, "requester", "v1:one", ReportCategory.ORDER,
                "order-1", "Damaged", List.of());
        var replay = store.begin(submission, "requester", "v1:one", ReportCategory.ORDER,
                "order-1", "Damaged", List.of());

        assertTrue(first.created());
        assertFalse(replay.created());
        assertEquals(first.submission().reportId(), replay.submission().reportId());
        assertThrows(ConflictException.class, () -> store.begin(submission, "requester", "v1:other",
                ReportCategory.ORDER, "order-1", "Changed", List.of()));
        assertThrows(ConflictException.class, () -> store.begin(UUID.randomUUID().toString(), "requester",
                "v1:two", ReportCategory.ORDER, "order-1", "Another", List.of()));
    }

    @Test
    void activityRefreshesExpiryAndExactOneHourBoundaryRejectsOnlyThePendingSubmission() {
        String submission = UUID.randomUUID().toString();
        var start = at(START);
        start.begin(submission, "requester", "v1:one", ReportCategory.ORDER,
                "order-1", "Damaged", List.of());
        at(START.plus(Duration.ofMinutes(30))).activity(submission, "requester");

        assertTrue(at(START.plus(Duration.ofMinutes(89)))
                .expirePreHold(submission, "expired").isEmpty());
        var expired = at(START.plus(Duration.ofMinutes(90)))
                .expirePreHold(submission, "expired").orElseThrow();
        assertEquals(ReportSubmissionState.REJECTED, expired.state());
        assertTrue(expired.fenced());

        var replacement = start.begin(UUID.randomUUID().toString(), "requester", "v1:two",
                ReportCategory.ORDER, "order-1", "Replacement", List.of());
        assertTrue(replacement.created(), "expiry must remove only the matching pending reservation");
    }

    @Test
    void expiredHoldIsFencedAndDelayedCompletionCannotActivateTheReport() {
        String submission = UUID.randomUUID().toString();
        var start = at(START);
        var begun = start.begin(submission, "requester", "v1:one", ReportCategory.ORDER,
                "order-1", "Damaged", List.of()).submission();
        start.evidenceStored(submission, "requester");
        start.acquireHoldLease(submission, "requester", START.plusSeconds(120));

        assertTrue(at(START.plusSeconds(119)).compensateExpiredHold(submission, "expired").isEmpty());
        var fenced = at(START.plusSeconds(120)).compensateExpiredHold(submission, "expired").orElseThrow();
        assertEquals(ReportSubmissionState.COMPENSATING, fenced.state());
        assertThrows(ConflictException.class, () -> start.complete(submission, "requester",
                new Report(begun.reportId(), "requester", ReportCategory.ORDER, "Damaged",
                        "order-1", "courier", ReportStatus.AWAITING_COURIER_RESPONSE, START,
                        START.plus(Duration.ofHours(24)), null, null, null, List.of(), List.of())));
    }

    @Test
    void safeCompensationResultRemovesReservationAndDuplicateResultIsIdempotent() {
        String submission = UUID.randomUUID().toString();
        var store = at(START);
        var begun = store.begin(submission, "requester", "v1:one", ReportCategory.ORDER,
                "order-1", "Damaged", List.of()).submission();
        store.evidenceStored(submission, "requester");
        store.acquireHoldLease(submission, "requester", START.plusSeconds(120));
        store.compensate(submission, "requester", "uncertain");
        String compensation = ReportSubmissionStore.compensationId(submission);
        String resultId = UUID.nameUUIDFromBytes(("ReportCreationCompensationResult:" + compensation)
                .getBytes(StandardCharsets.UTF_8)).toString();
        var result = new CreationCompensationMessages.Result(resultId, compensation, submission,
                begun.reportId(), "order-1", "requester", 2, "NOT_FOUND");

        assertEquals(ReportSubmissionState.COMPENSATED, store.accept(result).state());
        assertEquals(ReportSubmissionState.COMPENSATED, store.accept(result).state());
        assertTrue(store.dueCleanup().contains(submission));
        store.cleanupCompleted(submission);
        assertFalse(store.dueCleanup().contains(submission));
        assertTrue(store.begin(UUID.randomUUID().toString(), "requester", "v1:replacement",
                ReportCategory.ORDER, "order-1", "Replacement", List.of()).created());
    }
}
