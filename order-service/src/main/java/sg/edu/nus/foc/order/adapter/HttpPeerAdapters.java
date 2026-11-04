package sg.edu.nus.foc.order.adapter;

import java.util.Optional;
import java.time.Duration;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.order.adapter.dto.CreditCourierAssignmentRequest;
import sg.edu.nus.foc.order.application.CreditServicePort;
import sg.edu.nus.foc.order.application.SupplierServicePort;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.CourierAcceptanceDenied;
import sg.edu.nus.foc.order.security.CourierSuspensionAuthority;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import sg.edu.nus.foc.order.security.dto.UserRoleContextResponse;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.VerifiedOrderCaller;

@Component
@ConditionalOnProperty(name = "order.peers.mode", havingValue = "http")
public class HttpPeerAdapters implements UserServicePort, SupplierServicePort, CreditServicePort {

    private final RestClient user;
    private final RestClient supplier;
    private final RestClient credit;

    @Autowired
    public HttpPeerAdapters(
            @Value("${order.peers.user-url}") String userUrl,
            @Value("${order.peers.supplier-url}") String supplierUrl,
            @Value("${order.peers.credit-url}") String creditUrl,
            @Value("${order.peers.connect-timeout:3s}") Duration connectTimeout,
            @Value("${order.peers.read-timeout:5s}") Duration readTimeout) {
        this(
                HttpCreditCommandGateway.client(userUrl, connectTimeout, readTimeout),
                HttpCreditCommandGateway.client(supplierUrl, connectTimeout, readTimeout),
                HttpCreditCommandGateway.client(creditUrl, connectTimeout, readTimeout));
    }

    HttpPeerAdapters(RestClient user, RestClient supplier, RestClient credit) {
        this.user = user;
        this.supplier = supplier;
        this.credit = credit;
    }

    @Override
    public String verifyRequester(String id, String authorization) {
        Optional<String> verifiedIdentity = VerifiedOrderCaller.identityFor(Role.REQUESTER, id);
        if (verifiedIdentity.isPresent()) {
            return verifiedIdentity.get();
        }

        UserRoleContextResponse context = call(
                user,
                "/api/users/role-context",
                authorization,
                UserRoleContextResponse.class);
        requireMatchingRole(context, id, "requester");
        return context.getUserId();
    }

    @Override
    public String verifyCourier(String id, String authorization) {
        Optional<String> verifiedIdentity = VerifiedOrderCaller.identityFor(Role.COURIER, id);
        if (verifiedIdentity.isPresent()) {
            return verifiedIdentity.get();
        }

        UserRoleContextResponse context = call(
                user,
                "/api/users/role-context",
                authorization,
                UserRoleContextResponse.class);
        requireMatchingRole(context, id, "courier");
        return context.getUserId();
    }

    @Override
    public void requireCourierAcceptance(String id, String authorization) {
        Optional<String> verifiedIdentity = VerifiedOrderCaller.identityFor(Role.COURIER, id);
        if (verifiedIdentity.isPresent()
                && SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken caller) {
            for (GrantedAuthority authority : caller.getAuthorities()) {
                if (authority instanceof CourierSuspensionAuthority suspension) {
                    requireNotSuspended(suspension.suspended());
                    return;
                }
            }
        }
        UserRoleContextResponse context = call(user, "/api/users/role-context", authorization, UserRoleContextResponse.class);
        requireMatchingRole(context, id, "courier");
        requireNotSuspended(context.getCourierSuspended());
    }

    private static void requireNotSuspended(Boolean suspended) {
        if (suspended == null) throw new OrderProblem("SERVICE_UNAVAILABLE", "Courier suspension status could not be confirmed. Please try again later.");
        if (suspended) throw new CourierAcceptanceDenied();
    }

    @Override
    public void validatePair(String pickup, String delivery, String authorization) {
        SupplierPairValidationResponse response = peerCall("Supplier", () -> supplier.post()
                .uri("/api/suppliers/validate")
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader(authorization))
                .body(new SupplierPairRequest(pickup, delivery))
                .retrieve()
                .body(SupplierPairValidationResponse.class));
        if (response == null || response.getValid() == null) {
            throw new OrderProblem("SERVICE_UNAVAILABLE",
                    "Supplier Service did not confirm the pickup and delivery locations.");
        }
        if (!response.getValid()) {
            throw new OrderProblem("VALIDATION_ERROR",
                    "The selected pickup or delivery location is no longer available. Choose active, different locations.");
        }
    }

    @Override
    public void reserve(
            String orderId,
            String requester,
            long amount,
            String authorization) {
        try {
            credit.put()
                    .uri("/api/credits/orders/{id}/reservation", orderId)
                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader(authorization))
                    .body(new CreditReservationRequest(requester, amount))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            if (status == 409 && confirmsInsufficientCredits(exception)) {
                throw new OrderProblem("INSUFFICIENT_CREDITS", "Insufficient available credits.");
            }
            String code = switch (status) {
                case 400 -> "VALIDATION_ERROR";
                case 401 -> "UNAUTHENTICATED";
                case 403 -> "FORBIDDEN";
                case 404 -> "NOT_FOUND";
                case 409 -> "CONFLICT";
                default -> "SERVICE_UNAVAILABLE";
            };
            throw new OrderProblem(code, "Credit Service could not confirm the reservation.");
        } catch (RestClientException exception) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Credit Service reservation is unavailable.");
        }
    }

    private static boolean confirmsInsufficientCredits(RestClientResponseException exception) {
        try {
            return "INSUFFICIENT_CREDITS".equals(JsonMapper.builder().build()
                    .readTree(exception.getResponseBodyAsString()).path("error").asText());
        } catch (tools.jackson.core.JacksonException exceptionBody) {
            // A malformed peer response must never be presented as a confirmed balance error.
            return false;
        }
    }

    @Override
    public void assignCourier(
            String orderId,
            String courierId,
            String authorization) {
        CreditCourierAssignmentRequest request = new CreditCourierAssignmentRequest(courierId);
        ResponseEntity<Void> response = peerCall("Credit", () -> credit.put()
                .uri("/api/credits/orders/{id}/courier-assignment", orderId)
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader(authorization))
                .body(request)
                .retrieve()
                .toBodilessEntity());
        if (!response.getStatusCode().equals(HttpStatus.OK)) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Credit Service did not confirm the requested courier assignment.");
        }
    }

    @Override
    public void holdForReopen(
            String orderId,
            String authorization) {
        ResponseEntity<Void> response = peerCall("Credit", () -> credit.post()
                .uri("/api/credits/orders/{id}/hold-for-reopen", orderId)
                .header(HttpHeaders.AUTHORIZATION, authorizationHeader(authorization))
                .retrieve()
                .toBodilessEntity());
        if (!response.getStatusCode().equals(HttpStatus.OK)) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", "Credit Service did not synchronously confirm the reopen hold.");
        }
    }

    private static <T> T call(
            RestClient client,
            String path,
            String authorization,
            Class<T> responseType) {
        return peerCall("User", () -> client.get()
                    .uri(path)
                    .header(HttpHeaders.AUTHORIZATION, authorizationHeader(authorization))
                    .retrieve()
                    .body(responseType));
    }

    private static <T> T peerCall(String peer, java.util.function.Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientResponseException failure) {
            String code = switch (failure.getStatusCode().value()) {
                case 400, 422 -> "VALIDATION_ERROR";
                case 401 -> "UNAUTHENTICATED";
                case 403 -> "FORBIDDEN";
                case 404 -> "NOT_FOUND";
                case 409 -> "CONFLICT";
                default -> "SERVICE_UNAVAILABLE";
            };
            throw new OrderProblem(code, peer + " Service could not confirm the request.");
        } catch (RestClientException failure) {
            throw new OrderProblem("SERVICE_UNAVAILABLE", peer + " Service is unavailable.");
        }
    }

    private static String authorizationHeader(String authorization) {
        return authorization == null ? "" : authorization;
    }

    private static void requireMatchingRole(
            UserRoleContextResponse context,
            String requestedId,
            String role) {
        if (context == null
                || context.getUserId() == null
                || context.getUserId().isBlank()
                || !context.getUserId().equals(requestedId)
                || context.getRoles() == null
                || context.getRoles().stream().noneMatch(value -> role.equalsIgnoreCase(value))) {
            throw OrderProblem.forbidden(
                    "Authenticated user does not match the requested " + role + " identity.");
        }
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    private static class SupplierPairRequest {
        private String pickupSupplierId;
        private String deliverySupplierId;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    private static class SupplierPairValidationResponse {
        private Boolean valid;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    private static class CreditReservationRequest {
        private String requesterId;
        private long amount;
    }

}
