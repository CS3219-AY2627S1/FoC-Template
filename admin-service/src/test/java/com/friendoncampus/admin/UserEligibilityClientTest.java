package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class UserEligibilityClientTest {
    @Test void authenticatesToUserAndRejectsMalformedMismatchedAndUnavailableResponses() throws Exception {
        UUID id = UUID.randomUUID();
        var tokens = mock(ServiceTokens.class); when(tokens.issue("user-service")).thenReturn("service-assertion");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        final int[] status = {200}; final String[] body = {"{\"userId\":\""+id+"\",\"active\":true,\"administrator\":true}"};
        server.createContext("/internal/users/"+id+"/admin-eligibility", e -> {
            assertEquals("Bearer service-assertion", e.getRequestHeaders().getFirst("Authorization"));
            byte[] bytes = body[0].getBytes(StandardCharsets.UTF_8); e.sendResponseHeaders(status[0], bytes.length);
            try(var out = e.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            var client = new UserEligibilityClient(URI.create("http://127.0.0.1:"+server.getAddress().getPort()), tokens);
            assertTrue(client.find(id).administrator());
            body[0] = "{\"userId\":\""+UUID.randomUUID()+"\",\"active\":true,\"administrator\":true}";
            assertThrows(ResponseStatusException.class, () -> client.find(id));
            body[0] = "{}"; assertThrows(ResponseStatusException.class, () -> client.find(id));
            status[0] = 503; assertThrows(ResponseStatusException.class, () -> client.find(id));
            status[0] = 404; assertFalse(client.find(id).active());
        } finally { server.stop(0); }
    }
}
