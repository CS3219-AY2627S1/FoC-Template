package sg.edu.nus.foc.user.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Repo-wide rule (AGENTS.md section 6): every API endpoint is documented in OpenAPI.
 *
 * <p>Copy to src/test/java/.../api/, set the package and {@link #PREFIX}, and add whatever
 * test configuration your service needs to start (e.g. a Firestore emulator). The test fails
 * when an operation has no summary or no 2xx response, or lives outside the service prefix,
 * and writes the spec to target/openapi.json (CI publishes it as a build artifact).
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocumentationTest {

    private static final String PREFIX = "/api/users";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JsonMapper mapper;

    @Test
    void unifiedPenaltyPushRejectsUnauthenticatedRequests() throws Exception {
        mvc.perform(post(PREFIX + "/internal/penalties/events")
                .contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void everyEndpointIsDocumented() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/openapi.json"), json);

        JsonNode paths = mapper.readTree(json).path("paths");
        assertThat(paths.isEmpty()).as("OpenAPI document lists no paths").isFalse();
        JsonNode penalty = paths.path(PREFIX + "/internal/penalties/events").path("post");
        for (String code : List.of("200", "400", "401", "409")) assertThat(penalty.path("responses").has(code)).isTrue();
        JsonNode directory = paths.path(PREFIX + "/admin/search").path("get");
        assertThat(directory.path("responses").has("200")).isTrue();
        for (String code : List.of("400", "401", "403", "503")) assertThat(directory.path("responses").has(code)).isTrue();
        assertThat(directory.path("parameters").size()).isEqualTo(4);
        assertThat(directory.path("security").isEmpty()).isFalse();

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
                    problems.add(where + ": missing @Operation(summary = ...)");
                }
                boolean hasSuccess = operation.getValue().path("responses").propertyNames().stream()
                        .anyMatch(code -> code.startsWith("2"));
                if (!hasSuccess) {
                    problems.add(where + ": no 2xx response documented");
                }
            }
        }
        assertThat(problems).as("Undocumented API operations").isEmpty();
    }
}
