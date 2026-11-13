package sg.edu.nus.foc.supplier.api;

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
import sg.edu.nus.foc.supplier.support.FirestoreEmulator;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Repo-wide rule (AGENTS.md section 6): every API endpoint is documented in OpenAPI.
 * Fails the build when an operation has no summary, no success response, or lives outside
 * this service's /api prefix, and writes target/openapi.json for CI to publish.
 * Based on docs/templates/OpenApiDocumentationTest.java.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiDocumentationTest {

    private static final String PREFIX = "/api/suppliers";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("foc.supplier.firestore.emulator-host", FirestoreEmulator::endpoint);
        registry.add("foc.supplier.firestore.database-id", () -> "docs-test");
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

    @Test
    void swaggerUiIsServedUnderTheServicePrefix() throws Exception {
        mvc.perform(get(PREFIX + "/docs")).andExpect(status().is3xxRedirection());
    }
}
