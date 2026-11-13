/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Real HTTP contract client regression tests. */
package sg.edu.nus.foc.reporting.resolution;

import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.security.oauth2.jwt.Jwt;
import sg.edu.nus.foc.reporting.report.*;
import sg.edu.nus.foc.reporting.error.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class AdminReportResolutionControllerTest {
    @Test void createsFreshResponseWithoutDownstreamTransportOrSecurityHeaders() {
        ReportRepository reports = mock(ReportRepository.class);
        ReportResolutionStore store = mock(ReportResolutionStore.class);
        when(reports.findById("r")).thenReturn(Optional.of(report("order")));
        RestClient.Builder builder = RestClient.builder().baseUrl("http://order");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withSuccess("{\"commandId\":\"stable\",\"status\":\"SUCCEEDED\"}", MediaType.APPLICATION_JSON)
                .header(HttpHeaders.TRANSFER_ENCODING, "chunked")
                .header(HttpHeaders.CONTENT_LENGTH, "999")
                .header(HttpHeaders.CONNECTION, "keep-alive")
                .header(HttpHeaders.SET_COOKIE, "downstream-only=1"));
        ResponseEntity<?> response = new AdminReportResolutionController(reports, store, builder.build())
                .resolve("r", new AdminReportResolutionController.Request("stable", "Reviewed"), jwt);
        assertEquals(200, response.getStatusCode().value());
        assertTrue(response.getBody().toString().contains("SUCCEEDED"));
        for (String header : List.of(HttpHeaders.TRANSFER_ENCODING, HttpHeaders.CONTENT_LENGTH,
                HttpHeaders.CONNECTION, HttpHeaders.SET_COOKIE)) {
            assertNull(response.getHeaders().getFirst(header), header);
        }
        server.verify();
    }
    final Jwt jwt=Jwt.withTokenValue("token").header("alg","none").subject("admin").build();
    Report report(String order) { return new Report("r","requester",ReportCategory.ORDER,"Issue",order,"courier",ReportStatus.READY_FOR_REVIEW,Instant.now(),null,null,null,null,List.of(),List.of()); }
    @Test void forwardsAdminTokenStableCommandAndReplyAndPreservesPending() {
        var reports=mock(ReportRepository.class);var store=mock(ReportResolutionStore.class);
        when(reports.findById("r")).thenReturn(Optional.of(report("order")));
        var builder=RestClient.builder().baseUrl("http://order");var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://order/api/orders/admin/order/reports/r/resolve"))
                .andExpect(method(HttpMethod.POST)).andExpect(header("Authorization","Bearer token"))
                .andExpect(content().json("{\"commandId\":\"stable\",\"reply\":\"Reviewed\"}"))
                .andRespond(withStatus(HttpStatus.ACCEPTED).contentType(MediaType.APPLICATION_JSON).body("{\"commandId\":\"stable\",\"status\":\"COMPENSATING\"}"));
        var result=new AdminReportResolutionController(reports,store,builder.build()).resolve("r",new AdminReportResolutionController.Request("stable"," Reviewed "),jwt);
        assertEquals(202,result.getStatusCode().value()); verifyNoInteractions(store);server.verify();
    }
    @Test void mapsRemoteFailuresWithoutReleasingOrMutatingReport() {
        for(int code:List.of(403,409,500,404)) {
            var reports=mock(ReportRepository.class);var store=mock(ReportResolutionStore.class);
            when(reports.findById("r")).thenReturn(Optional.of(report("order")));
            var builder=RestClient.builder().baseUrl("http://order");var server=MockRestServiceServer.bindTo(builder).build();
            server.expect(anything()).andRespond(withStatus(HttpStatus.valueOf(code)));
            var controller=new AdminReportResolutionController(reports,store,builder.build());
            Class<? extends RuntimeException> expected = code==403?ForbiddenException.class:code==409?ConflictException.class:DependencyUnavailableException.class;
            assertThrows(expected,
                    ()->controller.resolve("r",new AdminReportResolutionController.Request("stable","Reply"),jwt));
            verifyNoInteractions(store);
        }
    }
    @Test void generalReportUsesLocalJournalAndMissingReportIsNotFound() {
        var reports=mock(ReportRepository.class);var store=mock(ReportResolutionStore.class);
        when(reports.findById("r")).thenReturn(Optional.of(report(null)));
        var controller=new AdminReportResolutionController(reports,store,RestClient.create());
        assertEquals(200,controller.resolve("r",new AdminReportResolutionController.Request("stable","Reply"),jwt).getStatusCode().value());
        verify(store).resolve(new ResolutionMessages.Command("stable","r",null,"requester","courier","admin",1,"Reply"));
        assertThrows(NotFoundException.class,()->controller.resolve("missing",new AdminReportResolutionController.Request("key","Reply"),jwt));
    }

    @Test void linkedCreditReportResolvesLocallyWithoutCallingOrderOrReleasingAHold() {
        var reports = mock(ReportRepository.class); var store = mock(ReportResolutionStore.class);
        Report report = new Report("r", "requester", ReportCategory.CREDITS, "Missing refund", "completed-order", null,
                ReportStatus.READY_FOR_REVIEW, Instant.now(), null, null, null, null, List.of(), List.of());
        when(reports.findById("r")).thenReturn(Optional.of(report));
        var builder = RestClient.builder().baseUrl("http://order");
        var server = MockRestServiceServer.bindTo(builder).build();
        var controller = new AdminReportResolutionController(reports, store, builder.build());
        assertEquals(200, controller.resolve("r", new AdminReportResolutionController.Request("stable", "Reply"), jwt).getStatusCode().value());
        verify(store).resolve(new ResolutionMessages.Command("stable", "r", "completed-order", "requester", null, "admin", 1, "Reply"));
        server.verify();
    }
    @Test void googlePushRequiresIssuerAudienceExpiryAndVerifiedAccount() {
        var s=new ResolutionSettings(true,"real","topic","sub","https://audience","push@project.iam.gserviceaccount.com","",false);
        var validate=ReportPushSecurity.validator(s);
        java.util.function.Function<String,Jwt.Builder> builder=issuer->Jwt.withTokenValue("signed").header("alg","RS256").issuer(issuer).subject("service")
                .audience(List.of("https://audience")).expiresAt(Instant.now().plusSeconds(60))
                .claim("email",s.account()).claim("email_verified",true);
        assertFalse(validate.validate(builder.apply("https://accounts.google.com").build()).hasErrors());
        assertTrue(validate.validate(builder.apply("https://securetoken.google.com/real").build()).hasErrors());
        assertTrue(validate.validate(builder.apply("https://accounts.google.com").audience(List.of("wrong")).build()).hasErrors());
        assertTrue(validate.validate(builder.apply("https://accounts.google.com").claim("email","wrong").build()).hasErrors());
        assertTrue(validate.validate(builder.apply("https://accounts.google.com").claim("email_verified",false).build()).hasErrors());
        assertTrue(validate.validate(builder.apply("https://accounts.google.com").expiresAt(Instant.now().minusSeconds(90)).build()).hasErrors());
    }
}
