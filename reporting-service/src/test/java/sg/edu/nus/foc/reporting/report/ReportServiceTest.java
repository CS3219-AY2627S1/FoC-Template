package sg.edu.nus.foc.reporting.report;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.error.NotFoundException;
import sg.edu.nus.foc.reporting.order.AssociatedOrder;
import sg.edu.nus.foc.reporting.order.OrderAssociationClient;
import sg.edu.nus.foc.reporting.storage.AttachmentStorage;
import sg.edu.nus.foc.reporting.storage.StoredObject;

import static org.junit.jupiter.api.Assertions.*;

class ReportServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-27T10:00:00Z");
    private final MemoryRepository repository = new MemoryRepository();
    private final MemoryStorage storage = new MemoryStorage();
    private final RecordingOrders orders = new RecordingOrders();
    private ReportService service;

    @BeforeEach void setUp() { service = at(NOW); }

    @Test void courierErrandReportNotifiesRequesterWithoutASelfResponse() {
        orders.courierId = "courier";
        Report report = service.submit("courier", "Bearer courier", ReportCategory.ERRAND,
                "Cannot reach requester", "order", List.of());
        assertEquals("courier", report.reporterId());
        assertEquals("requester", report.requesterId());
        assertEquals("courier", report.courierId());
        assertEquals(ReportCategory.ERRAND, report.category());
        assertEquals(List.of("COURIER"), orders.reporterRoles);
        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE, report.status());
        assertEquals(NOW.plusSeconds(86400), report.responseDeadlineAt());
        assertEquals("requester", report.respondentId());
        assertEquals(1, service.awaitingResponseCount("requester"));
        assertEquals(1, service.listMine("requester", "against-me", 1, 20).totalItems());
        assertDoesNotThrow(() -> service.detail(report.id(), "requester", false));
        assertEquals(0, service.awaitingResponseCount("courier"));
        assertEquals(1, service.listMine("courier", "submitted", 1, 20).totalItems());
        assertEquals(0, service.listMine("courier", "against-me", 1, 20).totalItems());
        assertThrows(ForbiddenException.class, () -> service.respond(report.id(), "courier", "Self response", List.of()));
    }

    @Test void assignedOrderCreatesHoldAndTwentyFourHourResponseWindow() {
        orders.courierId = "courier";
        Report report = service.submit("requester", "Bearer token", ReportCategory.ORDER,
                " damaged ", "order", List.of(png("proof.png")));

        assertEquals(ReportStatus.AWAITING_COURIER_RESPONSE, report.status());
        assertEquals(NOW.plusSeconds(24 * 60 * 60), report.responseDeadlineAt());
        assertEquals("courier", report.courierId());
        assertEquals(List.of(true), orders.requireCourier);
        assertEquals(List.of("REQUESTER"), orders.reporterRoles);
        assertEquals("Bearer token", orders.tokens.getFirst());
        assertEquals(1, report.attachments().size());
        assertEquals(1, service.awaitingResponseCount("courier"));
        assertEquals(0, service.awaitingResponseCount("other"));
    }

    @Test void retiredCategoriesRejectNewReportsBeforeUploadsOrOrderCalls() {
        for (ReportCategory category : List.of(ReportCategory.COURIER, ReportCategory.CREDITS)) {
            BadRequestException failure = assertThrows(BadRequestException.class,
                    () -> service.submit("requester", "Bearer token", category, "Issue", null, List.of()));
            assertEquals("Choose Order, Errand or General for a new report.", failure.getMessage());
        }
        assertTrue(repository.values.isEmpty());
        assertTrue(orders.requireCourier.isEmpty());
    }

    @Test void openOrdersAreRejectedForOrderReports() {
        orders.status = "OPEN";
        assertThrows(NotFoundException.class, () -> service.submit("requester", "Bearer token", ReportCategory.ORDER,
                "No courier accepted", "order", List.of()));
        assertEquals(List.of(true), orders.requireCourier);
        assertTrue(repository.values.isEmpty());
    }

    @Test void nonOrderCategoriesAreUnlinkedAndOrderCategoriesRequireAnOrder() {
        Report general = service.submit("requester", "Bearer token", ReportCategory.GENERAL,
                "General issue", null, null);
        assertEquals(ReportStatus.READY_FOR_REVIEW, general.status());
        assertNull(general.orderId());
        assertThrows(BadRequestException.class, () -> service.submit("requester", "Bearer token",
                ReportCategory.GENERAL, "Credits", "order", List.of()));
        assertThrows(BadRequestException.class, () -> service.submit("requester", "Bearer token",
                ReportCategory.ORDER, "Order", null, List.of()));
        assertTrue(orders.requireCourier.isEmpty());
    }

    @Test void rejectsUnownedTerminalOrInvalidHoldSnapshotsBeforeSaving() {
        orders.courierId = "courier";
        orders.requesterId = "someone-else";
        assertThrows(DependencyUnavailableException.class, () -> service.submit("requester", "Bearer token",
                ReportCategory.ORDER, "Unowned", "order", List.of()));
        assertTrue(repository.values.isEmpty());

        orders.requesterId = "requester";
        orders.status = "COMPLETED";
        assertThrows(DependencyUnavailableException.class, () -> service.submit("requester", "Bearer token",
                ReportCategory.ORDER, "Terminal", "order", List.of()));
        assertTrue(repository.values.isEmpty());

        orders.status = "DELIVERED";
        orders.completionHold = false;
        assertThrows(DependencyUnavailableException.class, () -> service.submit("requester", "Bearer token",
                ReportCategory.ORDER, "No hold", "order", List.of()));
        assertTrue(repository.values.isEmpty());
    }

    @Test void courierCanRespondOnceBeforeButNotAtTheDeadline() {
        orders.courierId = "courier";
        Report report = service.submit("requester", "Bearer token", ReportCategory.ORDER,
                "Damaged", "order", List.of());
        Report before = at(report.responseDeadlineAt().minusNanos(1)).respond(report.id(), "courier",
                "Collected intact", List.of(png("reply.png")));
        assertEquals(ReportStatus.READY_FOR_REVIEW, before.status());
        assertEquals("Collected intact", before.courierResponse());
        assertEquals(1, before.responseAttachments().size());
        assertThrows(ConflictException.class, () -> service.respond(report.id(), "courier", "Again", List.of()));
        Report resolved = repository.update(report.id(), r -> r.resolved(report.responseDeadlineAt().minusNanos(1))).orElseThrow();
        assertEquals(ReportStatus.RESOLVED, resolved.status());
        assertThrows(ConflictException.class, () -> service.respond(report.id(), "courier", "After resolution", List.of()));

        Report second = service.submit("requester", "Bearer token", ReportCategory.ORDER,
                "Another", "order", List.of());
        assertThrows(ConflictException.class, () -> at(second.responseDeadlineAt())
                .respond(second.id(), "courier", "Too late", List.of()));
        assertEquals(ReportStatus.READY_FOR_REVIEW, at(second.responseDeadlineAt()).detail(second.id(), "requester", false).status());
    }

    @Test void responseAndReadsAreParticipantScoped() {
        orders.courierId = "courier";
        Report report = service.submit("requester", "Bearer token", ReportCategory.ORDER,
                "Issue", "order", List.of(png("proof.png")));
        assertThrows(ForbiddenException.class, () -> service.respond(report.id(), "someone", "No", List.of()));
        assertThrows(ForbiddenException.class, () -> service.detail(report.id(), "someone", false));
        assertDoesNotThrow(() -> service.detail(report.id(), "someone", true));
        assertArrayEquals(pngBytes(), service.attachment(report.id(), report.attachments().getFirst().id(),
                "courier", false).bytes());
        assertThrows(NotFoundException.class, () -> service.attachment(report.id(), "missing", "requester", false));
    }

    @Test void mineListsAreScopedAndLegacyResolutionCannotReleaseAHold() {
        orders.courierId = "courier";
        Report report = service.submit("requester", "Bearer requester", ReportCategory.ORDER,
                "Issue", "order", List.of());
        service.submit("other", "Bearer other", ReportCategory.GENERAL, "Other", null, List.of());
        assertEquals(1, service.listMine("requester", "submitted", 1, 20).totalItems());
        assertEquals(1, service.listMine("courier", "against-me", 1, 20).totalItems());
        assertThrows(BadRequestException.class, () -> service.listMine("requester", "other", 1, 20));
        assertThrows(ConflictException.class, () -> service.resolve(report.id(), "Bearer admin"));

        at(report.responseDeadlineAt()).detail(report.id(), "requester", false);
        assertThrows(ConflictException.class, () -> at(report.responseDeadlineAt()).resolve(report.id(), "Bearer admin"));
        assertTrue(orders.releasedReports.isEmpty());
        assertEquals(ReportStatus.READY_FOR_REVIEW, repository.findById(report.id()).orElseThrow().status());
    }


    @Test void creditsAreUnlinkedAndRejectSubmittedOrderIdsWithoutCallingOrder() {
        Report result = service.submit("requester", "Bearer token", ReportCategory.GENERAL, "Missing credit", null, List.of());
        assertNull(result.orderId());
        assertNull(result.courierId());
        assertNull(result.responseDeadlineAt());
        assertEquals(ReportStatus.READY_FOR_REVIEW, result.status());
        assertThrows(BadRequestException.class, () -> service.submit("requester", "Bearer token", ReportCategory.CREDITS, "Issue", "order", List.of()));
        assertTrue(orders.requireCourier.isEmpty());
        assertTrue(orders.tokens.isEmpty());
    }

    private ReportService at(Instant instant) {
        return new ReportService(repository, storage, orders, new ImageValidator(), Clock.fixed(instant, ZoneOffset.UTC));
    }
    private static MockMultipartFile png(String name) { return new MockMultipartFile("photos", name, "image/png", pngBytes()); }
    private static byte[] pngBytes() { return new byte[]{(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}; }

    static class RecordingOrders implements OrderAssociationClient {
        String courierId;
        String requesterId = "requester";
        String status = "DELIVERED";
        boolean completionHold = true;
        final List<Boolean> requireCourier = new ArrayList<>();
        final List<String> reporterRoles = new ArrayList<>();
        final List<String> tokens = new ArrayList<>();
        final List<String> releasedReports = new ArrayList<>();
        @Override public AssociatedOrder placeReportHold(String id, String reportId, boolean required, String token, String reporterRole) {
            requireCourier.add(required); tokens.add(token);
            reporterRoles.add(reporterRole);
            if (status.equals("OPEN")) throw new NotFoundException("not reportable");
            if (required && courierId == null) throw new ConflictException("missing courier");
            return new AssociatedOrder(id, requesterId, courierId, status, reportId, completionHold);
        }
        @Override public void releaseReportHold(String orderId, String reportId, String token) {
            releasedReports.add(reportId); tokens.add(token);
        }
    }

    static class MemoryStorage implements AttachmentStorage {
        final Map<String, StoredObject> objects = new LinkedHashMap<>();
        @Override public void put(String key, String type, byte[] bytes) { objects.put(key, new StoredObject(bytes, type)); }
        @Override public StoredObject get(String key) { return Optional.ofNullable(objects.get(key)).orElseThrow(() -> new NotFoundException("missing")); }
        @Override public void delete(String key) { objects.remove(key); }
    }

    static class MemoryRepository implements ReportRepository {
        final Map<String, Report> values = new LinkedHashMap<>();
        @Override public long countAwaitingResponse(String id, Instant now) {
            return values.values().stream().filter(r -> id.equals(r.respondentId()) && r.status() == ReportStatus.AWAITING_COURIER_RESPONSE && r.responseDeadlineAt() != null && now.isBefore(r.responseDeadlineAt())).count();
        }
        @Override public Report save(Report report) { values.put(report.id(), report); return report; }
        @Override public Optional<Report> findById(String id) { return Optional.ofNullable(values.get(id)); }
        @Override public PageResult<Report> findAll(int page, int size) { return page(item -> true, page, size); }
        @Override public PageResult<Report> findByReporterId(String id, int page, int size) { return page(item -> id.equals(item.reporterId()), page, size); }
        @Override public PageResult<Report> findByRespondentId(String id, int page, int size) { return page(item -> id.equals(item.respondentId()), page, size); }
        @Override public Optional<Report> update(String id, UnaryOperator<Report> operation) {
            Report current = values.get(id);
            if (current == null) return Optional.empty();
            Report updated = operation.apply(current); values.put(id, updated); return Optional.of(updated);
        }
        private PageResult<Report> page(Predicate<Report> filter, int page, int size) {
            List<Report> items = values.values().stream().filter(filter).toList();
            return new PageResult<>(items, page, size, items.size(), items.isEmpty() ? 0 : 1);
        }
    }
}
