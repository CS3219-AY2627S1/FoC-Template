/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Implementation.
 * Scope: Generated Reporting Service code for the team-specified reporting, association, storage, security, and administration contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.order;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.function.Supplier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriUtils;
import sg.edu.nus.foc.reporting.config.ReportingProperties;
import sg.edu.nus.foc.reporting.error.ConflictException;
import sg.edu.nus.foc.reporting.error.BadRequestException;
import sg.edu.nus.foc.reporting.error.DependencyUnavailableException;
import sg.edu.nus.foc.reporting.error.ForbiddenException;
import sg.edu.nus.foc.reporting.error.NotFoundException;

@Component
public class HttpOrderAssociationClient implements OrderAssociationClient {
    private final RestClient client;
    private final Supplier<String> serviceAuthorization;
    @Autowired
    public HttpOrderAssociationClient(ReportingProperties properties, ReportHoldCredentials credentials) {
        Duration timeout = properties.orderService().timeout();
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(timeout); factory.setReadTimeout(timeout);
        client = RestClient.builder().baseUrl(properties.orderService().baseUrl()).requestFactory(factory).build();
        serviceAuthorization = credentials;
    }
    HttpOrderAssociationClient(RestClient client, Supplier<String> credentials) {
        this.client = client; this.serviceAuthorization = credentials;
    }
    @Override public AssociatedOrder placeReportHold(String orderId, String reportId,
                                                      boolean requireAssignedCourier, String bearerToken, String reporterRole) {
        return placeReportHold(orderId, reportId, reportId, requireAssignedCourier, bearerToken, reporterRole);
    }
    @Override public AssociatedOrder placeReportHold(String orderId, String reportId, String submissionId,
                                                      boolean requireAssignedCourier, String bearerToken, String reporterRole) {
        try {
            String id = UriUtils.encodePathSegment(orderId, StandardCharsets.UTF_8);
            String report = UriUtils.encodePathSegment(reportId, StandardCharsets.UTF_8);
            String serviceToken = serviceAuthorization.get();
            var request = client.put()
                    .uri(URI.create("/api/orders/internal/report-holds/" + id + "/" + report))
                    .header(HttpHeaders.AUTHORIZATION, bearerToken)
                    .header(ReportHoldCredentials.HEADER, serviceToken);
            // Cloud Run may consume this header; retain the complete signed token separately for Order verification.
            if (serviceToken.startsWith("Bearer ")) request.header("X-Serverless-Authorization", serviceToken);
            AssociatedOrder result = request
                    .body(new PlaceReportHoldRequest(requireAssignedCourier, reporterRole, submissionId))
                    .retrieve().body(AssociatedOrder.class);
            if (result == null || !orderId.equals(result.id()) || result.requesterId() == null
                    || result.status() == null || !reportId.equals(result.reportId())
                    || !result.isCompletionHold()) {
                throw new DependencyUnavailableException("Order Service returned an invalid report hold.");
            }
            return result;
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.BAD_REQUEST))
                throw new BadRequestException("The selected order report request is invalid.");
            if (e.getStatusCode().isSameCodeAs(HttpStatus.UNAUTHORIZED)
                    || e.getStatusCode().isSameCodeAs(HttpStatus.FORBIDDEN))
                throw new ForbiddenException("You are not authorised to report the selected order.");
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) throw new NotFoundException("The selected order is unavailable for reporting.");
            if (e.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
                if (e.getResponseBodyAsString().contains("This order already has an active report.")
                        || e.getResponseBodyAsString().contains("This order has an active report.")) {
                    throw new ConflictException("This order has an active report. Please resolve it before proceeding.");
                }
                throw new ConflictException("The selected order cannot accept this report.");
            }
            throw new DependencyUnavailableException("Order Service is unavailable.", e);
        } catch (RestClientException e) { throw new DependencyUnavailableException("Order Service is unavailable.", e); }
    }

    @Override public void releaseReportHold(String orderId, String reportId, String bearerToken) {
        try {
            String id = UriUtils.encodePathSegment(orderId, StandardCharsets.UTF_8);
            String report = UriUtils.encodePathSegment(reportId, StandardCharsets.UTF_8);
            client.put().uri(URI.create("/api/orders/admin/" + id + "/completion-holds/" + report + "/release"))
                    .header(HttpHeaders.AUTHORIZATION, bearerToken).retrieve().toBodilessEntity();
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().isSameCodeAs(HttpStatus.NOT_FOUND)) {
                throw new NotFoundException("The report hold could not be released.");
            }
            if (e.getStatusCode().isSameCodeAs(HttpStatus.CONFLICT)) {
                throw new ConflictException("The report hold is not ready to be released.");
            }
            throw new DependencyUnavailableException("Order Service is unavailable.", e);
        } catch (RestClientException e) { throw new DependencyUnavailableException("Order Service is unavailable.", e); }
    }

    private record PlaceReportHoldRequest(boolean requireAssignedCourier, String reporterRole, String submissionId) { }
}
