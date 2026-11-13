/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.report;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.Firestore;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.reporting.support.FirestoreEmulator;

import static org.junit.jupiter.api.Assertions.*;

class FirestoreReportRepositoryIntegrationTest {
    private static final String DATABASE = "reporting-repository-test";
    private static Firestore firestore;
    private FirestoreReportRepository repository;

    @BeforeAll static void connect() { firestore = FirestoreEmulator.client(DATABASE); }
    @AfterAll static void close() throws Exception { firestore.close(); }
    @BeforeEach void reset() { FirestoreEmulator.clear(DATABASE); repository = new FirestoreReportRepository(firestore); }

    @Test void courierSubmissionRoundTripsActualOwnerAndDoesNotAppearAgainstItself() throws Exception {
        Report errand = new Report("errand", "courier", ReportCategory.ERRAND, "Requester issue", "order", "courier",
                ReportStatus.READY_FOR_REVIEW, Instant.parse("2026-11-01T10:00:00Z"), null, null, null, null, List.of(), List.of(), null, null, "owner");
        repository.save(errand);
        assertEquals(errand, repository.findById("errand").orElseThrow());
        assertEquals(1, repository.findByReporterId("courier", 1, 20).totalItems());
        assertEquals(0, repository.findByRespondentId("courier", 1, 20).totalItems());
        Report legacy = report("legacy", Instant.now(), List.of());
        repository.save(legacy);
        firestore.collection("reports").document("legacy").update("requesterId", com.google.cloud.firestore.FieldValue.delete()).get();
        assertEquals(legacy.reporterId(), repository.findById("legacy").orElseThrow().requesterId());
    }

    @Test void upgradeNotifiesRequesterOnceAndAllowsTheirEvidenceWithoutChangingResolvedHistory() {
        Instant now = Instant.parse("2026-11-02T10:00:00Z");
        Report legacy = new Report("legacy-errand", "courier", ReportCategory.ERRAND, "Nothing at pickup", "o", "courier",
                ReportStatus.READY_FOR_REVIEW, now.minusSeconds(86400), null, null, null, null, List.of(), List.of(), null, null, "owner");
        repository.save(legacy);
        Report resolved = new Report("resolved-errand", "courier", ReportCategory.ERRAND, "Old", "old", "courier",
                ReportStatus.RESOLVED, now.minusSeconds(86400), null, null, null, now, List.of(), List.of(), null, null, "owner");
        repository.save(resolved);
        ReportDeadlineScheduler scheduler = new ReportDeadlineScheduler(repository, java.time.Clock.fixed(now, java.time.ZoneOffset.UTC));
        scheduler.reconcileDue();
        Report upgraded = repository.findById(legacy.id()).orElseThrow();
        assertEquals(ReportCategory.ERRAND, upgraded.category());
        assertEquals(now.plusSeconds(86400), upgraded.responseDeadlineAt());
        scheduler.reconcileDue();
        assertEquals(upgraded, repository.findById(legacy.id()).orElseThrow());
        assertEquals(resolved, repository.findById(resolved.id()).orElseThrow());
        assertEquals(1, repository.countAwaitingResponse("owner", now));
        assertEquals(0, repository.countAwaitingResponse("courier", now));
        assertEquals(2, repository.findByRespondentId("owner", 1, 20).totalItems());
        assertEquals(0, repository.findByRespondentId("courier", 1, 20).totalItems());
        Attachment evidence = new Attachment("a", "reports/r/response/a", "pickup.webp", "image/webp", 4, now);
        Report response = repository.update(upgraded.id(), current -> current.respond("owner", "Moved to counter", now, List.of(evidence))).orElseThrow();
        assertEquals(ReportStatus.READY_FOR_REVIEW, response.status());
        assertEquals(List.of(evidence), response.responseAttachments());
        assertEquals(0, repository.countAwaitingResponse("owner", now));
    }

    @Test void roundTripsMetadataAndListsNewestBeforePaginating() {
        Attachment attachment = new Attachment("a1", "reports/r1/a1", "receipt.png", "image/png", 8, Instant.parse("2026-10-13T01:00:00Z"));
        Report first = report("r1", Instant.parse("2026-10-13T01:00:00Z"), List.of(attachment));
        Report second = report("r2", Instant.parse("2026-10-13T02:00:00Z"), List.of());
        Report third = report("r3", Instant.parse("2026-10-13T03:00:00Z"), List.of());
        repository.save(first); repository.save(second); repository.save(third);
        assertEquals(first, repository.findById("r1").orElseThrow());
        PageResult<Report> page = repository.findAll(1, 2);
        assertEquals(List.of(third, second), page.items()); assertEquals(3, page.totalItems()); assertEquals(2, page.totalPages());
        assertEquals(List.of(first), repository.findAll(2, 2).items());
        assertTrue(repository.findAll(3, 2).items().isEmpty());
    }

    @Test void updatesTransactionallyAndFiltersParticipantPages() {
        Report open = repository.save(report("open", Instant.parse("2026-10-13T01:00:00Z"), List.of()));
        Instant resolvedAt = Instant.parse("2026-10-13T04:00:00Z");
        Report resolved = repository.update(open.id(), item -> item.resolved(resolvedAt)).orElseThrow();
        assertEquals(ReportStatus.RESOLVED, resolved.status()); assertEquals(resolvedAt, resolved.resolvedAt());
        assertEquals(resolved, repository.update(open.id(), item -> item.resolved(Instant.parse("2026-10-13T05:00:00Z"))).orElseThrow());
        assertEquals(1, repository.findByReporterId("reporter", 1, 20).totalItems());
        assertEquals(1, repository.findByRespondentId("courier", 1, 20).totalItems());
        assertEquals(0, repository.findByRespondentId("other", 1, 20).totalItems());
        assertTrue(repository.findById("a/b").isEmpty()); assertTrue(repository.findById(null).isEmpty());
        assertTrue(repository.update("missing", item -> item).isEmpty()); assertTrue(repository.update("a/b", item -> item).isEmpty());
    }

    @Test void adminFiltersAndCountAreAppliedBeforePaging() {
        var created=Instant.parse("2026-10-29T00:00:00Z");
        repository.save(report("a",created,List.of()));
        repository.save(report("b",created.plusSeconds(1),List.of()));
        repository.update("b",r->r.resolved(created.plusSeconds(2)));
        assertEquals(List.of("a"), repository.findAll(1,1,"order",ReportStatus.READY_FOR_REVIEW).items().stream().map(Report::id).toList());
        assertEquals(1,repository.findAll(1,1,"order",ReportStatus.RESOLVED).totalItems());
        assertEquals(0,repository.findAll(1,20,"missing",null).totalItems());
        repository.save(new Report("due","reporter",ReportCategory.ORDER,"Issue","order","courier",
                ReportStatus.AWAITING_COURIER_RESPONSE,created,created.plusSeconds(86400),null,null,null,List.of(),List.of()));
        var clock=java.time.Clock.fixed(created.plusSeconds(86400),java.time.ZoneOffset.UTC);
        assertEquals(List.of("due"),repository.dueResponseIds(clock.instant()));
        new ReportDeadlineScheduler(repository,clock).reconcileDue();
        assertEquals(ReportStatus.READY_FOR_REVIEW,repository.findById("due").orElseThrow().status());
        assertEquals(2,repository.findAll(1,20,"order",ReportStatus.READY_FOR_REVIEW).totalItems());
    }

    @Test void persistsCourierResponseAndReadsLegacyOpenAsReadyForReview() throws Exception {
        Instant created = Instant.parse("2026-10-13T01:00:00Z");
        Instant deadline = created.plusSeconds(86_400);
        Attachment evidence = new Attachment("response-a", "reports/r/response/a", "handoff.webp",
                "image/webp", 4, created.plusSeconds(60));
        Report awaiting = new Report("response", "reporter", ReportCategory.COURIER, "description",
                "order", "courier", ReportStatus.AWAITING_COURIER_RESPONSE, created, deadline,
                null, null, null, List.of(), List.of());
        repository.save(awaiting);
        Report responded = repository.update("response", item -> item.respond("courier", "Intact at handoff",
                created.plusSeconds(60), List.of(evidence))).orElseThrow();
        assertEquals(responded, repository.findById("response").orElseThrow());
        assertEquals(List.of(evidence), responded.responseAttachments());

        var legacy = new HashMap<String, Object>();
        legacy.put("id", "legacy"); legacy.put("reporterId", "legacy-reporter");
        legacy.put("category", "GENERAL"); legacy.put("description", "old record");
        legacy.put("status", "OPEN"); legacy.put("createdAt", Timestamp.of(java.util.Date.from(created)));
        legacy.put("attachments", List.of());
        firestore.collection(FirestoreReportRepository.COLLECTION).document("legacy").set(legacy).get();

        Report migrated = repository.findById("legacy").orElseThrow();
        assertEquals(ReportStatus.READY_FOR_REVIEW, migrated.status());
        assertTrue(repository.findAll(1, 20, null, ReportStatus.READY_FOR_REVIEW).items().stream()
                .anyMatch(item -> item.id().equals("legacy")));
        assertNull(migrated.responseDeadlineAt());
        assertTrue(migrated.responseAttachments().isEmpty());
    }


    @Test void responseCountIsCourierScopedAndExcludesRespondedResolvedAndExpiredReports() {
        Instant now = Instant.parse("2026-10-30T01:00:00Z");
        Report waiting = new Report("waiting", "owner", ReportCategory.ORDER, "Issue", "o", "courier",
                ReportStatus.AWAITING_COURIER_RESPONSE, now, now.plusSeconds(60), null, null, null, List.of(), List.of());
        repository.save(waiting);
        repository.save(new Report("expired", "owner", ReportCategory.ORDER, "Issue", "old", "courier",
                ReportStatus.AWAITING_COURIER_RESPONSE, now.minusSeconds(60), now, null, null, null, List.of(), List.of()));
        assertEquals(1, repository.countAwaitingResponse("courier", now));
        assertEquals(0, repository.countAwaitingResponse("outsider", now));
        repository.update("waiting", current -> current.respond("courier", "Explanation", now, List.of()));
        assertEquals(0, repository.countAwaitingResponse("courier", now));
        repository.update("waiting", current -> current.resolved(now));
        assertEquals(0, repository.countAwaitingResponse("courier", now));
    }

    @Test void linkedCreationRejectsLegacyAndConcurrentDuplicatesButAllowsResolvedOrders() throws Exception {
        Instant now = Instant.parse("2026-10-30T01:00:00Z");
        Report first = report("legacy-active", now, List.of());
        repository.save(first);
        var conflict = assertThrows(sg.edu.nus.foc.reporting.error.ConflictException.class,
                () -> repository.saveNewLinked(report("duplicate", now, List.of())));
        assertTrue(conflict.getMessage().contains("This order has an active report. Please resolve it before proceeding."));
        repository.update(first.id(), current -> current.resolved(now));
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var jobs = List.of("one", "two").stream().map(id -> pool.submit(() -> {
                try { repository.saveNewLinked(report(id, now, List.of())); return true; }
                catch (sg.edu.nus.foc.reporting.error.ConflictException rejected) { return false; }
            })).toList();
            int created = 0;
            for (var job : jobs) if (job.get()) created++;
            assertEquals(1, created);
        }
        String activeId = repository.findById("one").isPresent() ? "one" : "two";
        repository.update(activeId, current -> current.resolved(now));
        assertEquals("after-resolved", repository.saveNewLinked(report("after-resolved", now, List.of())).id());
        assertThrows(sg.edu.nus.foc.reporting.error.ConflictException.class,
                () -> repository.saveNewLinked(report("another", now, List.of())));
    }

    private static Report report(String id, Instant created, List<Attachment> attachments) {
        return new Report(id, "reporter", ReportCategory.ORDER, "description", "order", "courier",
                ReportStatus.READY_FOR_REVIEW, created, null, null, null, null, attachments, List.of());
    }
}
