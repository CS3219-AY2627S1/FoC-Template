/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Real Firestore saga safety regression tests; review pending. */
package sg.edu.nus.foc.reporting.report;

import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import com.google.cloud.firestore.Firestore;
import org.junit.jupiter.api.*;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.*;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.support.FirestoreEmulator;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;

class ReportResolutionStoreIntegrationTest {
    static final String DATABASE="report-resolution-saga-tests";
    static Firestore db;
    final Instant now=Instant.parse("2026-10-29T00:00:00Z");
    ReportResolutionStore store;
    FirestoreReportRepository reports;
    @BeforeAll static void connect() { db=FirestoreEmulator.client(DATABASE); }
    @AfterAll static void close() throws Exception { db.close(); }
    @BeforeEach void reset() {
        FirestoreEmulator.clear(DATABASE);
        store=at(now); reports=new FirestoreReportRepository(db);
        reports.save(new Report("report", "requester", ReportCategory.ORDER, "Issue", "order", "courier",
                ReportStatus.AWAITING_COURIER_RESPONSE, now, now.plusSeconds(86400), null, null, null, List.of(), List.of()));
    }
    ReportResolutionStore at(Instant instant) { return new ReportResolutionStore(db, JsonMapper.builder().build(), Clock.fixed(instant, ZoneOffset.UTC)); }
    Command command(String key) { return new Command(key,"report","order","requester","courier","admin",1,"Reviewed evidence"); }
    Compensation compensation(String key) { return new Compensation(UUID.randomUUID().toString(),key,"report","order","requester","courier","admin",2); }

    @Test void courierReportResolvesAndCompensatesUsingActualRequesterInsteadOfSubmitter() {
        reports.save(new Report("report", "courier", ReportCategory.ERRAND, "Requester issue", "order", "courier",
                ReportStatus.READY_FOR_REVIEW, now, null, null, null, null, List.of(), List.of(), null, null, "requester"));
        assertEquals("BINDING_MISMATCH", store.resolve(new Command("wrong-owner", "report", "order", "courier",
                "courier", "admin", 1, "Wrong owner")).code());
        assertEquals("APPLIED", store.resolve(command("errand")).outcome());
        Report resolved = reports.findById("report").orElseThrow();
        assertEquals("requester", resolved.requesterId());
        assertEquals("courier", resolved.reporterId());
        assertEquals("Reviewed evidence", sg.edu.nus.foc.reporting.api.ReportResponse.from(resolved, "courier", false).resolutionNote());
        assertNull(sg.edu.nus.foc.reporting.api.ReportResponse.from(resolved, "requester", false).resolutionNote());
        assertEquals("REVERSED", store.compensate(compensation("errand")).code());
        Report restored = reports.findById("report").orElseThrow();
        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE, restored.status());
        assertEquals(ReportCategory.ERRAND, restored.category());
        assertEquals("requester", restored.requesterId());
        assertEquals(now.plusSeconds(86400), restored.responseDeadlineAt());
        assertNull(restored.resolutionNote());
    }

    @Test void resolutionIsAtomicIdempotentPrivateAndMayBeEarly() throws Exception {
        // Existing stored reports predate the separate actual-requester field.
        db.collection("reports").document("report").update("requesterId", com.google.cloud.firestore.FieldValue.delete()).get();
        var c=command("one"); var result=store.resolve(c);
        assertEquals("APPLIED",result.outcome()); assertEquals(result,store.resolve(c));
        var saved=reports.findById("report").orElseThrow();
        assertEquals(ReportStatus.RESOLVED,saved.status()); assertEquals("admin",saved.resolvedBy());
        assertEquals("Reviewed evidence",saved.resolutionNote());
        assertEquals(1L, db.collection("reports").document("report").get().get().getLong("revision"));
        assertNull(sg.edu.nus.foc.reporting.api.ReportResponse.from(saved,"courier",false).resolutionNote());
        assertEquals(saved.resolutionNote(),sg.edu.nus.foc.reporting.api.ReportResponse.from(saved,"requester",false).resolutionNote());
        assertEquals(saved.resolutionNote(),sg.edu.nus.foc.reporting.api.ReportResponse.from(saved,"other",true).resolutionNote());
        assertThrows(ConflictException.class,()->store.resolve(new Command("one","report","order","requester","courier","admin",1,"Different")));
        assertThrows(ConflictException.class,()->store.resolve(new Command("one","report","other","requester","courier","admin",1,c.reply())));
        assertThrows(ConflictException.class,()->reports.update("report",r->r.respond("courier","Too late",now,List.of())));
    }
    @Test void restoresEarlyPreimageDeduplicatesAndRepublishesSameResult() throws Exception {
        store.resolve(command("restore")); var c=compensation("restore"); var first=store.compensate(c);
        assertEquals("REVERSED",first.code());
        var restored=reports.findById("report").orElseThrow();
        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE,restored.status());
        assertNull(restored.resolutionNote()); assertNull(restored.resolvedAt());
        var claim=store.claim(c.eventId()).orElseThrow(); assertTrue(store.claim(c.eventId()).isEmpty());
        store.finish(claim,true); assertTrue(store.due().isEmpty());
        assertEquals(first,store.compensate(c)); assertEquals(List.of(c.eventId()),store.due());
        assertEquals("FENCED",store.resolve(command("restore")).code());
        assertEquals(2L,db.collection("reports").document("report").get().get().getLong("revision"));
        assertThrows(ConflictException.class,()->store.compensate(new Compensation(c.eventId(),"different","report","order","requester","courier","admin",2)));
        assertThrows(ConflictException.class,()->store.compensate(compensation("restore")));
    }
    @Test void expiredDeadlineIsNotExtendedByCompensation() {
        store.resolve(command("deadline"));
        at(now.plusSeconds(86400)).compensate(compensation("deadline"));
        var restored=reports.findById("report").orElseThrow();
        assertEquals(ReportStatus.READY_FOR_REVIEW,restored.status());
        assertEquals(now.plusSeconds(86400),restored.responseDeadlineAt());
    }
    @Test void compensationBeforeOriginalCreatesFenceAndNeverResolvesLater() {
        var c=compensation("delayed");
        assertEquals("FENCED_NO_EFFECT",store.compensate(c).code());
        assertEquals("FENCED",store.resolve(command("delayed")).code());
        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE,reports.findById("report").orElseThrow().status());
        assertEquals(store.compensate(c),store.compensate(c));
    }
    @Test void newerRevisionIsPreservedAndRequiresReconciliation() {
        store.resolve(command("old"));
        reports.update("report", r->new Report(r.id(),r.reporterId(),r.category(),r.description(),r.orderId(),r.courierId(),
                r.status(),r.createdAt(),r.responseDeadlineAt(),r.courierResponse(),r.respondedAt(),r.resolvedAt(),
                r.attachments(),r.responseAttachments(),"Newer admin work","other-admin"));
        var result=store.compensate(compensation("old"));
        assertEquals("RECONCILIATION_REQUIRED",result.outcome());
        assertEquals("Newer admin work",reports.findById("report").orElseThrow().resolutionNote());
    }
    @Test void noEffectDecisionsAreDurableAndSafeToFence() {
        assertEquals("BINDING_MISMATCH",store.resolve(new Command("wrong","report","order","other","courier","admin",1,"Reply")).code());
        assertEquals("REPORT_NOT_FOUND",store.resolve(new Command("missing","missing","order","requester",null,"admin",1,"Reply")).code());
        store.resolve(command("success"));
        assertEquals("ALREADY_RESOLVED",store.resolve(command("second")).code());
        assertEquals("FENCED_NO_EFFECT",store.compensate(compensation("second")).code());
    }
    @Test void concurrentDuplicateCommandsHaveOneRevisionAndOneDecision() throws Exception {
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var a=pool.submit(()->store.resolve(command("race")));
            var b=pool.submit(()->store.resolve(command("race")));
            assertEquals(a.get(20,TimeUnit.SECONDS),b.get(20,TimeUnit.SECONDS));
            assertEquals(1L,db.collection("reports").document("report").get().get().getLong("revision"));
        }
    }
    @Test void publishingLeaseRecoversAndFencesStalePublisherAndRetainsFailed() {
        var c=compensation("outbox"); store.compensate(c);
        var stale=store.claim(c.eventId()).orElseThrow();
        var later=at(now.plusSeconds(121)); var fresh=later.claim(c.eventId()).orElseThrow();
        store.finish(stale,true); assertTrue(later.claim(c.eventId()).isEmpty());
        later.finish(fresh,false);
        var far=at(now.plusSeconds(1000)); var retry=far.claim(c.eventId()).orElseThrow();
        far.finish(new ReportResolutionStore.Claim(retry.id(),retry.owner(),retry.payload(),10),false);
        assertTrue(at(now.plusSeconds(100000)).due().isEmpty());
        assertEquals(store.compensate(c),store.compensate(c));
        assertTrue(store.claim(c.eventId()).isPresent());
    }
}
