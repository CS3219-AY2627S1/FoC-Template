package sg.edu.nus.foc.reporting.order;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.error.NotFoundException;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class HttpOrderAssociationClientTest {
    private static final String SUBMISSION = "11111111-1111-4111-8111-111111111111";
    @Test void courierHoldSendsCourierScopeWithTheOriginalBearerToken() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://orders/api/orders/internal/report-holds/order/errand"))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer courier"))
                .andExpect(header("X-Reporting-Service-Authorization", "Bearer reporting-token"))
                .andExpect(header("X-Serverless-Authorization", "Bearer reporting-token"))
                .andExpect(content().json("{\"requireAssignedCourier\":true,\"reporterRole\":\"COURIER\",\"submissionId\":\"" + SUBMISSION + "\"}"))
                .andRespond(withSuccess("{\"id\":\"order\",\"requesterId\":\"owner\",\"courierId\":\"courier\",\"status\":\"ACCEPTED\",\"reportId\":\"errand\",\"isCompletionHold\":true}", MediaType.APPLICATION_JSON));
        assertEquals("owner", new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token")
                .placeReportHold("order", "errand", SUBMISSION, true, "Bearer courier", "COURIER").requesterId());
        server.verify();
    }
    @Test void placesTheAtomicActiveOrderHoldAndForwardsAuthorization() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(once(), requestTo("http://orders/api/orders/internal/report-holds/order%20one/report%2Fone"))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer abc"))
                .andExpect(content().json("{\"requireAssignedCourier\":true,\"submissionId\":\"" + SUBMISSION + "\"}"))
                .andRespond(withSuccess("{\"id\":\"order one\",\"requesterId\":\"owner\",\"courierId\":\"courier\",\"status\":\"DELIVERED\",\"reportId\":\"report/one\",\"isCompletionHold\":true}", MediaType.APPLICATION_JSON));
        AssociatedOrder order = new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token")
                .placeReportHold("order one", "report/one", SUBMISSION, true, "Bearer abc", "REQUESTER");
        assertEquals("owner", order.requesterId());
        assertEquals("courier", order.courierId());
        server.verify();
    }


    @Test void duplicateReportMessageIsPreservedWithoutMislabelingOtherConflicts() {
        for (String message : java.util.List.of("This order already has an active report.",
                "This order has an active report. Please resolve it before proceeding.")) {
            var builder = RestClient.builder().baseUrl("http://orders");
            var server = MockRestServiceServer.bindTo(builder).build();
            server.expect(anything()).andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT)
                    .contentType(MediaType.APPLICATION_JSON).body("{\"message\":\"" + message + "\"}"));
            var failure = assertThrows(ConflictException.class, () -> new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token").placeReportHold("id", "r", true, "Bearer x"));
            assertEquals("This order has an active report. Please resolve it before proceeding.", failure.getMessage());
            server.verify();
        }
    }

    @Test void releasesTheAdminReportHold() {
        RestClient.Builder builder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("http://orders/api/orders/admin/order/completion-holds/report/release"))
                .andExpect(method(org.springframework.http.HttpMethod.PUT))
                .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer admin"))
                .andRespond(withNoContent());
        new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token").releaseReportHold("order", "report", "Bearer admin");
        server.verify();
    }

    @Test void mapsMissingConflictAndDependencyFailures() {
        RestClient.Builder missingBuilder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer missing = MockRestServiceServer.bindTo(missingBuilder).build();
        missing.expect(anything()).andRespond(withResourceNotFound());
        assertThrows(NotFoundException.class, () -> new HttpOrderAssociationClient(missingBuilder.build(), () -> "Bearer reporting-token")
                .placeReportHold("id", "report", false, "Bearer x"));

        RestClient.Builder conflictBuilder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer conflict = MockRestServiceServer.bindTo(conflictBuilder).build();
        conflict.expect(anything()).andRespond(withStatus(org.springframework.http.HttpStatus.CONFLICT));
        assertThrows(ConflictException.class, () -> new HttpOrderAssociationClient(conflictBuilder.build(), () -> "Bearer reporting-token")
                .placeReportHold("id", "report", true, "Bearer x"));

        RestClient.Builder downBuilder = RestClient.builder().baseUrl("http://orders");
        MockRestServiceServer down = MockRestServiceServer.bindTo(downBuilder).build();
        down.expect(anything()).andRespond(withServerError());
        assertThrows(DependencyUnavailableException.class, () -> new HttpOrderAssociationClient(downBuilder.build(), () -> "Bearer reporting-token")
                .placeReportHold("id", "report", false, "Bearer x"));
    }

    @Test void rejectsEveryMalformedHoldResponse() {
        for (String body : java.util.List.of(
                "",
                "{\"id\":\"other\",\"requesterId\":\"owner\",\"status\":\"DELIVERED\",\"reportId\":\"report\",\"isCompletionHold\":true}",
                "{\"id\":\"order\",\"status\":\"DELIVERED\",\"reportId\":\"report\",\"isCompletionHold\":true}",
                "{\"id\":\"order\",\"requesterId\":\"owner\",\"reportId\":\"report\",\"isCompletionHold\":true}",
                "{\"id\":\"order\",\"requesterId\":\"owner\",\"status\":\"DELIVERED\",\"reportId\":\"other\",\"isCompletionHold\":true}",
                "{\"id\":\"order\",\"requesterId\":\"owner\",\"status\":\"DELIVERED\",\"reportId\":\"report\",\"isCompletionHold\":false}")) {
            var builder = RestClient.builder().baseUrl("http://orders");
            var server = MockRestServiceServer.bindTo(builder).build();
            server.expect(anything()).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            assertThrows(DependencyUnavailableException.class, () -> new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token")
                    .placeReportHold("order", "report", false, "Bearer x"));
            server.verify();
        }
    }

    @Test void mapsAllHoldAndReleaseErrorResponses() {
        assertHoldFailure(org.springframework.http.HttpStatus.BAD_REQUEST, BadRequestException.class);
        assertHoldFailure(org.springframework.http.HttpStatus.UNAUTHORIZED, ForbiddenException.class);
        assertHoldFailure(org.springframework.http.HttpStatus.FORBIDDEN, ForbiddenException.class);
        assertHoldFailure(org.springframework.http.HttpStatus.I_AM_A_TEAPOT, DependencyUnavailableException.class);

        assertReleaseFailure(org.springframework.http.HttpStatus.NOT_FOUND, NotFoundException.class);
        assertReleaseFailure(org.springframework.http.HttpStatus.CONFLICT, ConflictException.class);
        assertReleaseFailure(org.springframework.http.HttpStatus.BAD_GATEWAY, DependencyUnavailableException.class);
    }

    private static void assertHoldFailure(org.springframework.http.HttpStatus status,
            Class<? extends RuntimeException> expected) {
        var builder = RestClient.builder().baseUrl("http://orders");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withStatus(status));
        assertThrows(expected, () -> new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token")
                .placeReportHold("order", "report", false, "Bearer x"));
        server.verify();
    }

    private static void assertReleaseFailure(org.springframework.http.HttpStatus status,
            Class<? extends RuntimeException> expected) {
        var builder = RestClient.builder().baseUrl("http://orders");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withStatus(status));
        assertThrows(expected, () -> new HttpOrderAssociationClient(builder.build(), () -> "Bearer reporting-token")
                .releaseReportHold("order", "report", "Bearer x"));
        server.verify();
    }
}
