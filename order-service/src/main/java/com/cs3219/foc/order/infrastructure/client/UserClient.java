package com.cs3219.foc.order.infrastructure.client;

import com.cs3219.foc.order.config.ServiceClientProperties;
import com.cs3219.foc.order.model.dto.UserBriefDto;
import com.cs3219.foc.order.security.AuthenticationContextService;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class UserClient {
    private final RestClient client;
    private final AuthenticationContextService authenticationContextService;

    public UserClient(
            ServiceClientProperties properties,
            AuthenticationContextService authenticationContextService,
            RestClient.Builder builder) {
        this.authenticationContextService = authenticationContextService;
        var factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(5));
        client = builder.baseUrl(properties.userUrl()).requestFactory(factory).build();
    }

    public Map<UUID, UserBriefDto> find(Set<UUID> ids) {
        if (ids.isEmpty()) return Map.of();
        if (!(authenticationContextService.requireAuthentication() instanceof JwtAuthenticationToken authentication)) {
            throw new AuthenticationCredentialsNotFoundException("JWT is required for user lookup");
        }
        List<UserBriefDto> response = client.get()
                .uri(builder -> builder.path("/users/brief")
                        .queryParam("ids", ids.stream().map(UUID::toString).collect(Collectors.joining(",")))
                        .build())
                .headers(headers ->
                        headers.setBearerAuth(authentication.getToken().getTokenValue()))
                .retrieve()
                .body(new ParameterizedTypeReference<List<UserBriefDto>>() {});
        return Objects.requireNonNull(response, "User brief response is missing").stream()
                .collect(Collectors.toMap(UserBriefDto::id, user -> user));
    }
}
