/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.api;

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
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Repo-wide OpenAPI completeness gate, based on docs/templates/OpenApiDocumentationTest.java. */
@SpringBootTest(properties = {"REPORT_RESPONSE_RECOVERY_CRON=-", "REPORT_RESULT_RECOVERY_CRON=-",
        "REPORT_RESOLUTION_ENABLED=true", "REPORT_PUBSUB_PROJECT_ID=demo-foc", "REPORT_RESOLUTION_RESULT_TOPIC=results",
        "REPORT_RESOLUTION_COMPENSATION_SUBSCRIPTION=projects/demo-foc/subscriptions/test-compensation",
        "REPORT_RESOLUTION_PUSH_MODE=emulator", "PUBSUB_EMULATOR_HOST=localhost:9997", "FIREBASE_AUTH_EMULATOR_HOST=localhost:9099",
        "foc.reporting.firestore.emulator-host=localhost:9999", "foc.reporting.storage.emulator-host=http://localhost:9998", "foc.reporting.user-service.mode=mock"})
@AutoConfigureMockMvc
class OpenApiDocumentationTest {
    private static final String PREFIX = "/api/reports";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");
    @Autowired MockMvc mvc;
    @Autowired JsonMapper mapper;

    @Test void everyEndpointIsDocumented() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Files.createDirectories(Path.of("target")); Files.writeString(Path.of("target/openapi.json"), json);
        JsonNode paths = mapper.readTree(json).path("paths");
        assertThat(paths.isEmpty()).as("OpenAPI document lists no paths").isFalse();
        List<String> problems = new ArrayList<>();
        for (Map.Entry<String, JsonNode> path : paths.properties()) {
            if (!path.getKey().startsWith(PREFIX)) problems.add(path.getKey() + ": outside " + PREFIX);
            for (Map.Entry<String, JsonNode> operation : path.getValue().properties()) {
                if (!METHODS.contains(operation.getKey())) continue;
                String where = operation.getKey().toUpperCase() + " " + path.getKey();
                if (operation.getValue().path("summary").asString("").isBlank()) problems.add(where + ": missing @Operation(summary = ...)");
                boolean hasSuccess = operation.getValue().path("responses").propertyNames().stream().anyMatch(code -> code.startsWith("2"));
                if (!hasSuccess) problems.add(where + ": no 2xx response documented");
            }
        }
        assertThat(problems).as("Undocumented API operations").isEmpty();
    }

    @Test void reportSubmissionRequiresAuthentication() throws Exception {
        mvc.perform(post(PREFIX)).andExpect(status().isUnauthorized());
    }
}
