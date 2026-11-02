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
    private final ReportController controller = new ReportController(service, roles);
    private final Jwt jwt = Jwt.withTokenValue("token").header("alg", "none").subject("u").build();
    private final Report report = new Report("r", "u", ReportCategory.GENERAL, "description", null, null,
            ReportStatus.READY_FOR_REVIEW, Instant.parse("2026-10-13T00:00:00Z"), null, null, null,
            null, List.of(new Attachment("a", "private", "photo.png", "image/png", 3,
            Instant.parse("2026-10-13T00:00:00Z"))), List.of());

    @Test void createsListsViewsRespondsAndResolvesReports() {
        when(service.submit(eq("u"), eq("Bearer token"), any(), any(), isNull(), isNull())).thenReturn(report);
        var created = controller.create(new CreateReportRequest(ReportCategory.GENERAL, "description", null), null, jwt);
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
}
