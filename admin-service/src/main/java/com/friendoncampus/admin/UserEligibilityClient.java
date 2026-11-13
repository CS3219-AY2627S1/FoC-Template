package com.friendoncampus.admin;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Component
public class UserEligibilityClient {
    private final URI base;
    private final ServiceTokens tokens;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    private final JsonMapper mapper = JsonMapper.builder().build();
    public UserEligibilityClient(@Value("${app.user.base-url}") URI base, ServiceTokens tokens) {
        if (!SetOfSchemes.valid(base)) throw new IllegalArgumentException("User URL must be HTTP(S) with a host");
        this.base = base; this.tokens = tokens;
    }
    public Eligibility find(UUID userId) {
        try {
            HttpRequest request = HttpRequest.newBuilder(base.resolve("/internal/users/" + userId + "/admin-eligibility"))
                    .timeout(Duration.ofSeconds(3)).header("Authorization", "Bearer " + tokens.issue("user-service"))
                    .header("Accept", "application/json").GET().build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 404) return new Eligibility(userId, false, false);
            if (response.statusCode() != 200) throw new IllegalStateException();
            var data = mapper.readTree(response.body());
            if (!data.path("userId").asText().equals(userId.toString()) || !data.path("active").isBoolean()
                    || !data.path("administrator").isBoolean()) throw new IllegalStateException();
            return new Eligibility(userId, data.get("active").asBoolean(), data.get("administrator").asBoolean());
        } catch (Exception ex) {
            if (ex instanceof InterruptedException) Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Current account access could not be verified");
        }
    }
    public record Eligibility(UUID userId, boolean active, boolean administrator) { }
    private static class SetOfSchemes {
        static boolean valid(URI uri) { return ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) && uri.getHost() != null; }
    }
}
