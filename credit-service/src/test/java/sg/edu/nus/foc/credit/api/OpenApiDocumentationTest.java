/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-09-25
 * Mode: Test generation and testing assistance.
 * Scope: Generated initial API integration and OpenAPI verification tests for team-finalized behavior.
 * Author review:  I reviewed for correctness.
 */
package sg.edu.nus.foc.credit.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.credit.support.PostgreSqlTestContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocumentationTest {

    private static final String PREFIX = "/api/credits";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        PostgreSqlTestContainer.register(registry);
    }

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JsonMapper mapper;

    @Test
    void everyEndpointIsDocumented() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/openapi.json"), json);

        JsonNode paths = mapper.readTree(json).path("paths");
        assertThat(paths.isEmpty()).isFalse();
        List<String> problems = new ArrayList<>();
        for (Map.Entry<String, JsonNode> path : paths.properties()) {
            if (!path.getKey().startsWith(PREFIX)) {
                problems.add(path.getKey() + ": outside " + PREFIX);
            }
            for (Map.Entry<String, JsonNode> operation : path.getValue().properties()) {
                if (!METHODS.contains(operation.getKey())) {
                    continue;
                }
                String where = operation.getKey().toUpperCase() + " " + path.getKey();
                if (operation.getValue().path("summary").asString("").isBlank()) {
                    problems.add(where + ": missing summary");
                }
                boolean hasSuccess = operation.getValue().path("responses").propertyNames().stream()
                        .anyMatch(code -> code.startsWith("2"));
                if (!hasSuccess) {
                    problems.add(where + ": no 2xx response");
                }
            }
        }
        assertThat(problems).isEmpty();
    }

    @Test
    void swaggerUiIsServedUnderTheCreditPrefix() throws Exception {
        mvc.perform(get(PREFIX + "/docs")).andExpect(status().is3xxRedirection());
    }

    @Test
    void commandRecoveryContractDocumentsHeadersAndEndpoints() throws Exception {
        JsonNode paths = mapper.readTree(mvc.perform(get(PREFIX + "/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).path("paths");

        assertThat(paths.has(PREFIX + "/commands/{key}")).isTrue();
        assertThat(paths.has(PREFIX + "/commands/{key}/compensate")).isTrue();
        JsonNode compensate = paths.path(PREFIX + "/commands/{key}/compensate").path("post");
        assertThat(compensate.path("requestBody").isMissingNode()).isTrue();
        assertThat(compensate.path("parameters").toString())
                .contains("Idempotency-Key")
                .contains("X-Command-Generation");
        assertThat(compensate.path("responses").path("200").path("headers").toString())
                .contains("Idempotency-Key")
                .contains("Command-Outcome");
    }

    @Test
    void adminEndpointsAreDocumented() throws Exception {
        JsonNode paths = mapper.readTree(mvc.perform(get(PREFIX + "/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).path("paths");

        assertThat(paths.has(PREFIX + "/registration-facts")).isFalse();

        JsonNode userBalance = paths.path(PREFIX + "/users/{userId}/balance").path("get");
        assertThat(userBalance.path("summary").asString()).isNotBlank();
        assertThat(userBalance.path("parameters").toString()).contains("userId");
        assertThat(userBalance.path("responses").toString())
                .contains("200")
                .contains("400")
                .contains("401")
                .contains("403")
                .contains("404")
                .contains("503");

        JsonNode userHistory = paths.path(PREFIX + "/users/{userId}/transactions").path("get");
        assertThat(userHistory.path("summary").asString()).isNotBlank();
        assertThat(userHistory.path("parameters").toString())
                .contains("userId")
                .contains("page")
                .contains("size");
        assertThat(userHistory.path("responses").toString())
                .contains("200")
                .contains("403")
                .contains("404");

        JsonNode allHistory = paths.path(PREFIX + "/all/transactions").path("get");
        assertThat(allHistory.path("summary").asString()).isNotBlank();
        assertThat(allHistory.path("parameters").toString())
                .contains("page")
                .contains("size");
        assertThat(allHistory.path("responses").toString())
                .contains("200")
                .contains("403");
    }

    @Test
    void compensationReceiverAndRedriveAreDocumented() throws Exception {
        JsonNode paths = mapper.readTree(mvc.perform(get(PREFIX + "/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString()).path("paths");

        JsonNode receiver = paths.path(PREFIX + "/internal/command-compensations").path("post");
        assertThat(receiver.path("summary").asString()).contains("compensation");
        assertThat(receiver.path("responses").toString())
                .contains("204").contains("400").contains("401").contains("409").contains("503");

        JsonNode redrive = paths.path(PREFIX
                + "/admin/compensation-results/{eventId}/redrive").path("post");
        assertThat(redrive.path("summary").asString()).contains("Redrive");
        assertThat(redrive.path("parameters").toString()).contains("eventId");
        assertThat(redrive.path("responses").toString())
                .contains("202").contains("403").contains("404").contains("409");
    }
}
