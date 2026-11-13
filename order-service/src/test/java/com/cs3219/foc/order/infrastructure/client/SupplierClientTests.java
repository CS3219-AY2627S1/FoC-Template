package com.cs3219.foc.order.infrastructure.client;

import static org.assertj.core.api.Assertions.*;

import com.cs3219.foc.order.config.ServiceClientProperties;
import com.cs3219.foc.order.security.AuthenticationContextService;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.client.RestClient;

class SupplierClientTests {
    @Test
    void forwardsJwtAndReturnsOnlyActiveSuppliers() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        var token = new AtomicReference<String>();
        UUID active = UUID.randomUUID();
        server.createContext("/api/suppliers", exchange -> {
            try (exchange) {
                token.set(exchange.getRequestHeaders().getFirst("Authorization"));
                byte[] bytes = ("""
                        [{"id":"%s","name":"Cafe","building":"COM1","active":true},
                         {"id":"%s","name":"Inactive","active":false}]
                        """).formatted(active, UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
        });
        server.start();
        try {
            SecurityContextHolder.getContext()
                    .setAuthentication(new JwtAuthenticationToken(Jwt.withTokenValue("current-token")
                            .header("alg", "none")
                            .subject("requester")
                            .build()));
            var client = new SupplierClient(
                    new ServiceClientProperties(
                            "http://127.0.0.1:" + server.getAddress().getPort() + "/api",
                            "http://unused/api",
                            "http://unused/api"),
                    new AuthenticationContextService(),
                    RestClient.builder());
            assertThat(client.listActive()).extracting("id").containsExactly(active);
            assertThat(token.get()).isEqualTo("Bearer current-token");
        } finally {
            server.stop(0);
            SecurityContextHolder.clearContext();
        }
    }
}
