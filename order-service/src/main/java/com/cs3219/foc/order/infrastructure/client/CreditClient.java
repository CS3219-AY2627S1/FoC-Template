package com.cs3219.foc.order.infrastructure.client;

import com.cs3219.foc.order.config.ServiceClientProperties;
import com.cs3219.foc.order.exception.CreditAccountPendingException;
import com.cs3219.foc.order.model.dto.CreditReservationResponse;
import com.cs3219.foc.order.model.dto.ErrorResponse;
import com.cs3219.foc.order.model.dto.ReserveCreditRequest;
import com.cs3219.foc.order.security.AuthenticationContextService;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class CreditClient {
    private final RestClient client;
    private final AuthenticationContextService authenticationContextService;

    public CreditClient(
            ServiceClientProperties properties,
            AuthenticationContextService authenticationContextService,
            RestClient.Builder builder) {
        this.authenticationContextService = authenticationContextService;
        var factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        client = builder.baseUrl(properties.creditUrl()).requestFactory(factory).build();
    }

    public void requireAccountReady() {
        if (!(authenticationContextService.requireAuthentication() instanceof JwtAuthenticationToken authentication)) {
            throw new AuthenticationCredentialsNotFoundException("JWT is required for credit account lookup");
        }
        try {
            client.get()
                    .uri("/credits/me")
                    .headers(headers ->
                            headers.setBearerAuth(authentication.getToken().getTokenValue()))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 409) {
                var error = exception.getResponseBodyAs(ErrorResponse.class);
                if (error != null && "CREDIT_ACCOUNT_PENDING".equals(error.code())) {
                    throw new CreditAccountPendingException();
                }
            }
            throw exception;
        }
    }

    public CreditReservationResponse reserve(ReserveCreditRequest request) {
        if (!(authenticationContextService.requireAuthentication() instanceof JwtAuthenticationToken authentication)) {
            throw new AuthenticationCredentialsNotFoundException("JWT is required for credit reservation");
        }
        return client.post()
                .uri("/credits/reservations")
                .headers(headers ->
                        headers.setBearerAuth(authentication.getToken().getTokenValue()))
                .body(request)
                .retrieve()
                .body(CreditReservationResponse.class);
    }
}
