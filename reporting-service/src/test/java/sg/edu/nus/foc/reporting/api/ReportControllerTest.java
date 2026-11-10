/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-11-10
 * Mode: Code generation and testing assistance.
 * Scope: Generated the report controller test cases from
 * user-approved contracts.
 * Author review: I reviewed for correctness.
 */

package sg.edu.nus.foc.reporting.api;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.report.*;
import sg.edu.nus.foc.reporting.security.CallerRoles;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ReportControllerTest {
    private final ReportService service = mock(ReportService.class);
    private final CallerRoles roles = mock(CallerRoles.class);
    private final ReportCreationCoordinator creations = mock(ReportCreationCoordinator.class);
    private final ReportController controller = new ReportController(service, roles, creations);
    private final Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject("u").build();
    private final Report report = new Report("r", "u", ReportCategory.GENERAL, "description", null, null,
            ReportStatus.READY_FOR_REVIEW, Instant.parse("2026-10-13T00:00:00Z"), null, null, null,
            null, List.of(new Attachment("a", "private", "photo.png", "image/png", 3,
            Instant.parse("2026-10-13T00:00:00Z"))), List.of());

    @Test void createsListsViewsRespondsAndResolvesReports() {
        String submissionId="11111111-1111-4111-8111-111111111111";
        var submission=new ReportSubmission(submissionId,"r","u","hash",ReportCategory.GENERAL,null,
                "description",List.of(),ReportSubmissionState.COMPLETED,false,2,0,null,null,null,null,null,null,
                report.createdAt(),report.createdAt());
        when(creations.submit(eq(submissionId),eq("u"),eq("Bearer token"),any(),any(),isNull(),isNull()))
                .thenReturn(new ReportCreationCoordinator.Outcome(submission,report,true));
        var created = controller.create(new CreateReportRequest(submissionId,ReportCategory.GENERAL, "description", null), null, jwt);
        assertEquals(HttpStatus.CREATED, created.getStatusCode());

        when(service.list(1, 20)).thenReturn(new PageResult<>(List.of(report), 1, 20, 1, 1));
        assertEquals(1, controller.list(1, 20).items().size());
        when(service.listMine("u", "submitted", 1, 20)).thenReturn(new PageResult<>(List.of(report), 1, 20, 1, 1));
        assertEquals(1, controller.mine("submitted", 1, 20, jwt).items().size());

        Authentication authentication = mock(Authentication.class);
        when(service.detail("r", "u", false)).thenReturn(report);
        assertEquals("r", controller.detail("r", jwt, authentication).id());

        when(service.respond(eq("r"), eq("u"), eq("reply"), isNull())).thenReturn(report);
        assertEquals("r", controller.respond("r", new CreateReportResponseRequest("reply"), null, jwt).id());

        Report resolved = report.resolved(Instant.parse("2026-10-13T01:00:00Z"));
        when(service.resolve("r", "Bearer token")).thenReturn(resolved);
        assertEquals(ReportStatus.RESOLVED,
                controller.resolve("r", new UpdateReportStatusRequest(ReportStatus.RESOLVED), jwt).status());
    }


    @Test void responseCountUsesTheVerifiedPrincipalOnly() {
        when(service.awaitingResponseCount("u")).thenReturn(4L);
        assertEquals(4, controller.responseCount(jwt).count());
        verify(service).awaitingResponseCount("u");
    }

    @Test void resumesAndExposesEveryDurableSubmissionOutcome() {
        String submissionId = "11111111-1111-4111-8111-111111111111";
        var request = new CreateReportRequest(submissionId, ReportCategory.GENERAL, "description", null);
        var completed = submission(submissionId, ReportSubmissionState.COMPLETED, "r");
        var pending = submission(submissionId, ReportSubmissionState.HOLD_PENDING, null);

        assertThrows(sg.edu.nus.foc.reporting.error.BadRequestException.class, () ->
                controller.resume("22222222-2222-4222-8222-222222222222", request, null, jwt));

        when(creations.submit(eq(submissionId), eq("u"), eq("Bearer token"), any(), any(), isNull(), isNull()))
                .thenReturn(new ReportCreationCoordinator.Outcome(completed, report, false));
        assertEquals(HttpStatus.OK, controller.resume(submissionId, request, null, jwt).getStatusCode());

        when(creations.submit(eq(submissionId), eq("u"), eq("Bearer token"), any(), any(), isNull(), isNull()))
                .thenReturn(new ReportCreationCoordinator.Outcome(pending, null, false));
        var accepted = controller.resume(submissionId, request, null, jwt);
        assertEquals(HttpStatus.ACCEPTED, accepted.getStatusCode());
        assertNull(accepted.getBody().report());

        when(creations.status(submissionId, "u"))
                .thenReturn(new ReportCreationCoordinator.Outcome(pending, null, false));
        assertEquals(ReportSubmissionState.HOLD_PENDING,
                controller.submission(submissionId, jwt).state());

        when(creations.cancel(submissionId, "u"))
                .thenReturn(new ReportCreationCoordinator.Outcome(pending, null, false));
        assertEquals(submissionId, controller.cancelSubmission(submissionId, jwt).submissionId());
    }

    @Test void listsReportsWithAdminFilters() {
        when(service.list(2, 10, "order-1", ReportStatus.READY_FOR_REVIEW))
                .thenReturn(new PageResult<>(List.of(report), 2, 10, 11, 2));

        var page = controller.listFiltered(2, 10, "order-1", ReportStatus.READY_FOR_REVIEW);

        assertEquals(1, page.items().size());
        assertEquals(11, page.totalItems());
        verify(service).list(2, 10, "order-1", ReportStatus.READY_FOR_REVIEW);
    }

    @Test void streamsPrivateAttachmentsAndRejectsReopening() {
        Authentication authentication = mock(Authentication.class);
        when(service.attachment("r", "a", "u", false)).thenReturn(
                new ReportService.AttachmentDownload(report.attachments().getFirst(), new byte[]{1, 2, 3}));
        var response = controller.attachment("r", "a", jwt, authentication);
        assertArrayEquals(new byte[]{1, 2, 3}, response.getBody());
        assertTrue(response.getHeaders().getCacheControl().contains("no-store"));
        assertThrows(sg.edu.nus.foc.reporting.error.BadRequestException.class, () ->
                controller.resolve("r", new UpdateReportStatusRequest(ReportStatus.READY_FOR_REVIEW), jwt));
    }

    @Test void checksAdminRoleOnlyAfterParticipantAccessIsDenied() {
        Authentication authentication = mock(Authentication.class);
        when(service.detail("r", "u", false)).thenThrow(new ForbiddenException("participants only"));
        when(roles.isAdmin(authentication)).thenReturn(true);
        when(service.detail("r", "u", true)).thenReturn(report);
        assertEquals("r", controller.detail("r", jwt, authentication).id());

        when(service.attachment("r", "a", "u", false)).thenThrow(new ForbiddenException("participants only"));
        when(service.attachment("r", "a", "u", true)).thenReturn(
                new ReportService.AttachmentDownload(report.attachments().getFirst(), new byte[]{1}));
        assertArrayEquals(new byte[]{1}, controller.attachment("r", "a", jwt, authentication).getBody());

        when(roles.isAdmin(authentication)).thenReturn(false);
        assertThrows(ForbiddenException.class, () -> controller.detail("r", jwt, authentication));
    }

    private ReportSubmission submission(String submissionId, ReportSubmissionState state, String reportId) {
        return new ReportSubmission(submissionId, reportId, "u", "hash", ReportCategory.GENERAL, null,
                "description", List.of(), state, false, 2, 0, null, null, null, null, null, null,
                report.createdAt(), report.createdAt());
    }
}
