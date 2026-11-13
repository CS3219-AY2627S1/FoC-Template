package sg.edu.nus.foc.CHANGEME.api;

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

    private static final String PREFIX = "/api/CHANGEME";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");

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
        assertThat(paths.isEmpty()).as("OpenAPI document lists no paths").isFalse();

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
