package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import sg.edu.nus.foc.order.api.mapper.ReportDemoMapper;
import sg.edu.nus.foc.order.api.dto.request.ReportDemoRequest;
import sg.edu.nus.foc.order.api.dto.response.ReportDemoResponse;
import sg.edu.nus.foc.order.application.adminmock.ReportDemoOrderStore;
import sg.edu.nus.foc.order.application.adminmock.ReportDemoService;
import sg.edu.nus.foc.order.domain.OrderProblem;

class ReportDemoServiceTest {
    private final ReportDemoMapper mapper = Mappers.getMapper(ReportDemoMapper.class);
    private final ReportDemoOrderStore orders = new ReportDemoOrderStore(mapper);
    private final Instant now = Instant.parse("2026-10-18T10:00:00Z");
    private final Clock clock = org.mockito.Mockito.mock(Clock.class);
    private final ReportDemoService reports = new ReportDemoService(orders, mapper, clock);
    @org.junit.jupiter.api.BeforeEach void clock() { org.mockito.Mockito.when(clock.instant()).thenReturn(now); }

    @Test void ownsDeliveredOrderAndOneCategoryAndHold() {
        String orderId = reports.eligible("owner").getFirst().getId();
        ReportDemoRequest request = request("owner", orderId);
        request.setUserId("other");
        assertThrows(OrderProblem.class, () -> reports.create(request));
        request.setUserId("owner");
        request.setViolationCategory("COURIER_UNRESPONSIVE");
        assertThrows(OrderProblem.class, () -> reports.create(request));
        request.setViolationCategory("WRONG_LOCATION_DELIVERY");
        ReportDemoResponse result = reports.create(request);
        assertEquals("AWAITING_COURIER_RESPONSE", result.getStatus());

        assertTrue(orders.sampleOrder(orderId).isCompletionHold());
        assertThrows(OrderProblem.class, () -> reports.create(request));
    }

    @Test void onlyAssignedCourierCanRespondAndAdminResolvesSeparatelyFromFunding() {
        ReportDemoResponse report = reports.create(request("owner", reports.eligible("owner").getFirst().getId()));
        ReportDemoRequest response = request("other", null);
        assertThrows(OrderProblem.class, () -> reports.respond(report.getId(), response));
        response.setUserId(report.getCourierId());
        ReportDemoResponse ready = reports.respond(report.getId(), response);
        assertEquals("READY_FOR_REVIEW", ready.getStatus());
        ReportDemoResponse resolved = reports.resolve(report.getId(), "admin", "Evidence reviewed; no financial action needed.");
        assertEquals("RESOLVED", resolved.getStatus());
        assertEquals("DELIVERED", resolved.getOrder().getStatus());
        assertFalse(resolved.getOrder().isCompletionHold());
        assertEquals(resolved.getResolvedAt(), reports.resolve(report.getId(), "admin", resolved.getResolutionNote()).getResolvedAt());
    }

    @Test void rejectsNonDeliveredOrdersAndMalformedEvidenceBeforeChangingSampleHold() {
        ReportDemoRequest open = request("demo-user-001", "demo-order-001");
        assertThrows(OrderProblem.class, () -> reports.create(open));
        String orderId = reports.eligible("owner").getFirst().getId();
        ReportDemoRequest malformed = request("owner", orderId);
        malformed.setAttachments(List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof.png", "image/png", "data:image/png;base64,not-base64")));
        assertThrows(OrderProblem.class, () -> reports.create(malformed));
        assertFalse(orders.sampleOrder(orderId).isCompletionHold());
    }

    @Test void noDeadlineBlocksAResponseAndAdminCanResolveWithoutWaiting() {
        ReportDemoResponse report = reports.create(request("owner", reports.eligible("owner").getFirst().getId()));
        org.mockito.Mockito.when(clock.instant()).thenReturn(now.plusSeconds(10 * 86400));
        assertEquals("AWAITING_COURIER_RESPONSE", reports.detail(report.getId(), "owner", false).getStatus());
        assertEquals("READY_FOR_REVIEW", reports.respond(report.getId(), request(report.getCourierId(), null)).getStatus());
        ReportDemoResponse unresolved = reports.list("owner", "against", "OPEN", 1).getItems().getFirst();
        assertEquals("RESOLVED", reports.resolve(unresolved.getId(), "admin", "Investigation reply to both participants.").getStatus());
    }

    @Test void listsAreParticipantScopedFilteredAndPagedAndDetailIsProtected() {
        assertEquals(1, reports.list("owner", "submitted", null, 1).getTotalItems());
        assertEquals(2, reports.list("owner", "against", "", 1).getTotalItems());
        assertEquals(3, reports.list("owner", "admin", "", 1).getTotalItems());
        assertEquals(1, reports.list("owner", "admin", "READY_FOR_REVIEW", 1).getTotalItems());
        assertTrue(reports.list("owner", "submitted", "RESOLVED", 1).getItems().isEmpty());
        assertTrue(reports.list("owner", "admin", null, 2).getItems().isEmpty());
        assertThrows(OrderProblem.class, () -> reports.list("owner", "unknown", null, 1));
        assertThrows(OrderProblem.class, () -> reports.list("owner", "submitted", null, 0));
        ReportDemoResponse report = reports.list("owner", "submitted", null, 1).getItems().getFirst();
        assertThrows(OrderProblem.class, () -> reports.detail(report.getId(), "stranger", false));
        assertEquals(report.getId(), reports.detail(report.getId(), report.getCourierId(), false).getId());
        assertEquals(report.getId(), reports.detail(report.getId(), "admin", true).getId());
        assertThrows(OrderProblem.class, () -> reports.detail("missing", "owner", true));
    }

    @Test void resolutionRequiresReplyIdentityAndStableReplayBinding() {
        ReportDemoResponse report = reports.create(request("owner", reports.eligible("owner").getFirst().getId()));
        reports.respond(report.getId(), request(report.getCourierId(), null));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), null, "Reviewed"));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), " ", "Reviewed"));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), "admin", null));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), "admin", " "));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), "admin", "x".repeat(2001)));
        reports.resolve(report.getId(), "admin", "Reviewed");
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), "another-admin", "Reviewed"));
        assertThrows(OrderProblem.class, () -> reports.resolve(report.getId(), "admin", "Different reason"));
    }

    @Test void evidenceIsCopiedAndValidFilesOrNoFilesAreAccepted() {
        String orderId = reports.eligible("owner").getFirst().getId();
        ReportDemoRequest input = request("owner", orderId);
        input.setAttachments(List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof.png", "image/png", "data:image/png;base64,aGVsbG8=")));
        ReportDemoResponse report = reports.create(input);
        input.getAttachments().getFirst().setName("changed.png");
        assertEquals("proof.png", reports.detail(report.getId(), "owner", false).getRequesterAttachments().getFirst().getName());
        ReportDemoRequest response = request(report.getCourierId(), null); response.setAttachments(null);
        assertTrue(reports.respond(report.getId(), response).getCourierAttachments().isEmpty());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.MethodSource("invalidEvidence")
    void invalidEvidenceNeverPlacesAHold(java.util.List<sg.edu.nus.foc.order.api.dto.request.ReportEvidence> files) {
        String orderId = reports.eligible("owner").getFirst().getId();
        ReportDemoRequest input = request("owner", orderId); input.setAttachments(files);
        assertThrows(OrderProblem.class, () -> reports.create(input));
        assertFalse(orders.sampleOrder(orderId).isCompletionHold());
    }
    static java.util.stream.Stream<org.junit.jupiter.params.provider.Arguments> invalidEvidence() {
        String prefix = "data:image/png;base64,";
        return java.util.stream.Stream.of(
                java.util.Arrays.asList((sg.edu.nus.foc.order.api.dto.request.ReportEvidence) null),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence(null, "image/png", prefix + "YQ==")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence(" ", "image/png", prefix + "YQ==")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("x".repeat(201), "image/png", prefix + "YQ==")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", null, prefix + "YQ==")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "text/html", prefix + "YQ==")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", null)),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", "x".repeat(2800001))),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", "https://public.example/proof.png")),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", prefix)),
                List.of(new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", prefix + "a".repeat(2796208))),
                java.util.Collections.nCopies(4, new sg.edu.nus.foc.order.api.dto.request.ReportEvidence("proof", "image/png", prefix + "YQ=="))
        ).map(org.junit.jupiter.params.provider.Arguments::of);
    }

    @Test void sampleIdentityValidationRejectsMissingOrInvalidUsers() {
        assertThrows(OrderProblem.class, () -> orders.reportFixtures(null));
        assertThrows(OrderProblem.class, () -> orders.reportFixtures(" "));
        assertThrows(OrderProblem.class, () -> orders.reportFixtures("x".repeat(129)));
    }

    @Test void resolutionReplyIsOnlyReturnedToSubmitterAndAdminWithoutMutatingStoredReply() {
        ReportDemoResponse report = reports.create(request("owner", reports.eligible("owner").getFirst().getId()));
        reports.resolve(report.getId(), "admin", "Private reply to submitter.");
        assertNull(reports.detail(report.getId(), report.getCourierId(), false).getResolutionNote());
        assertNull(reports.list(report.getCourierId(), "against", "RESOLVED", 1).getItems().getFirst().getResolutionNote());
        assertEquals("Private reply to submitter.", reports.detail(report.getId(), "owner", false).getResolutionNote());
        assertEquals("Private reply to submitter.", reports.detail(report.getId(), "admin", true).getResolutionNote());
        assertEquals("Private reply to submitter.", reports.list("owner", "submitted", "RESOLVED", 1).getItems().getFirst().getResolutionNote());
    }

    @Test void filtersExactOrderAndReportStatusBeforePaginationAndCounts() {
        var all=reports.list("owner","admin","OPEN",1).getItems();
        var target=all.stream().filter(r->"READY_FOR_REVIEW".equals(r.getStatus())).findFirst().orElseThrow();
        var matches=reports.list("owner","admin","OPEN",1," "+target.getOrder().getId()+" ","READY_FOR_REVIEW");
        assertEquals(1,matches.getTotalItems());assertEquals(target.getId(),matches.getItems().getFirst().getId());
        assertEquals(1,matches.getTotalPages());
        assertTrue(reports.list("owner","admin","OPEN",2,target.getOrder().getId(),"READY_FOR_REVIEW").getItems().isEmpty());
        assertEquals(1,reports.list("owner","admin","OPEN",2,target.getOrder().getId(),"READY_FOR_REVIEW").getTotalItems());
        assertTrue(reports.list("owner","admin","OPEN",1,target.getOrder().getId(),"RESOLVED").getItems().isEmpty());
        assertTrue(reports.list("owner","against","OPEN",1,target.getOrder().getId(),"").getItems().isEmpty());
        assertTrue(reports.list("owner","admin","OPEN",1,"missing","").getItems().isEmpty());
        assertThrows(OrderProblem.class,()->reports.list("owner","admin","OPEN",1,"","INVALID"));
        assertThrows(OrderProblem.class,()->reports.list("owner","admin","OPEN",1,"x".repeat(129),""));
    }

    private ReportDemoRequest request(String user, String order) {
        ReportDemoRequest request = new ReportDemoRequest();
        request.setUserId(user); request.setOrderId(order);
        request.setViolationCategory("WRONG_LOCATION_DELIVERY");
        request.setExplanation("The parcel was delivered to a different building.");
        request.setAttachments(List.of());
        return request;
    }
}
