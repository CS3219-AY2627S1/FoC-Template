package sg.edu.nus.foc.order.api;

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
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.autoconfigure.ImportAutoConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.TestPropertySource;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.security.autoconfigure.SecurityAutoConfiguration;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.OAuth2ResourceServerAutoConfiguration;
import org.springdoc.core.configuration.SpringDocConfiguration;
import org.springdoc.core.properties.SpringDocConfigProperties;
import org.springdoc.webmvc.core.configuration.SpringDocWebMvcConfiguration;
import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderAssignmentService;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.api.mapper.OrderMapperImpl;
import sg.edu.nus.foc.order.config.OpenApiConfiguration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Repo-wide rule: every API endpoint is documented in OpenAPI.
 *
 * <p>This MVC slice intentionally mocks the application collaborators so the
 * documentation check does not require PostgreSQL, peer services, or Docker.
 */
@WebMvcTest(controllers = {OrderController.class, AdminOrderController.class,
        OrderCommandController.class, OrderOutboxAdminController.class,
        OrderCompletionHoldController.class, OrderCreditHistoryController.class, OrderInvolvementController.class,
        CreditCompensationResultController.class, UserDeletionEligibilityController.class,
        AdminReportResolutionController.class, ReportCompensationResultController.class},
    excludeAutoConfiguration = {
        SecurityAutoConfiguration.class,
        OAuth2ResourceServerAutoConfiguration.class
    })
@Import({OrderMapperImpl.class, sg.edu.nus.foc.order.api.mapper.OrderInvolvementMapperImpl.class, OpenApiConfiguration.class})
@AutoConfigureMockMvc(addFilters = false)
@ImportAutoConfiguration({
    SpringDocConfigProperties.class,
    SpringDocConfiguration.class,
    SpringDocWebMvcConfiguration.class
})
@TestPropertySource(properties = {
    "springdoc.api-docs.path=/api/orders/v3/api-docs",
    "order.admin-mock.enabled=true",
    "order.commands.compensation.enabled=true",
    "order.reports.resolution.enabled=true",
    "FOC_INTERNAL_ORDER_API_ENABLED=true",
    "FOC_ENVIRONMENT=local",
    "order.security.auth.emulator-host=localhost:9099",
    "order.lifecycle-token=test-lifecycle-token"
})
class OpenApiDocumentationTest {
    @MockitoBean private sg.edu.nus.foc.order.application.reportresolution.ReportResolutionService reportResolutions;
    @MockitoBean private sg.edu.nus.foc.order.application.reportresolution.ReportResolutionJournal reportJournal;
    @MockitoBean private sg.edu.nus.foc.order.config.ReportResolutionSettings reportSettings;
    @MockitoBean private sg.edu.nus.foc.order.application.recovery.OrderCompensationJournal compensationJournal;
    @MockitoBean private sg.edu.nus.foc.order.config.CompensationTransportSettings compensationSettings;
    @MockitoBean private sg.edu.nus.foc.order.application.AdminApplyPenaltyService penalties;


    @MockitoBean private sg.edu.nus.foc.order.application.AdminOrderCancellationService adminCancellations;

    private static final String PREFIX = "/api/orders";
    private static final Set<String> METHODS = Set.of("get", "post", "put", "patch", "delete");

    @MockitoBean private OrderCreationService creation;
    @MockitoBean private OrderAssignmentService assignment;
    @MockitoBean private OrderTransitionService transitions;
    @MockitoBean private OrderQueryService queries;
    @MockitoBean private OrderRepostService reposts;
    @MockitoBean private LifecycleProcessingService lifecycle;
    @MockitoBean private UserServicePort users;
    @MockitoBean private sg.edu.nus.foc.order.application.recovery.OrderCommandService commands;
    @MockitoBean private sg.edu.nus.foc.order.security.OrderReadAccessPolicy readAccess;
    @MockitoBean private sg.edu.nus.foc.order.domain.repository.OrderEventOutboxRepository outbox;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderOutboxAfterCommitListener publication;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderCompletionHoldService completionHolds;
    @MockitoBean private sg.edu.nus.foc.order.application.OrderInvolvementService involvement;
    @MockitoBean private sg.edu.nus.foc.order.domain.repository.UserDeletionGuard deletionGuard;


    @Autowired private MockMvc mvc;
    @Autowired private JsonMapper mapper;

    @Test
    void expiryHttpTriggerIsRetiredWhileRepostRoutesRemainDocumented() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        JsonNode paths = mapper.readTree(json).path("paths");
        assertThat(paths.path(CreditCompensationResultController.PATH).path("post")
                .path("responses").has("204")).isTrue();
        assertThat(paths.path(ReportCompensationResultController.PATH).path("post").path("responses").has("204")).isTrue();
        assertThat(paths.path(PREFIX + "/admin/{orderId}/reports/{reportId}/resolve").path("post").path("responses").has("202")).isTrue();
        assertThat(paths.path(PREFIX + "/admin/report-resolutions/{commandId}").has("get")).isTrue();
        assertThat(paths.path(PREFIX + "/mine/completed").path("get").path("responses").has("200")).isTrue();
        assertThat(paths.path(PREFIX + "/mine/completed/{orderId}").path("get").path("responses").has("404")).isTrue();
        assertThat(paths.path(PREFIX + "/mine/cancelled").path("get").path("responses").has("200")).isTrue();
        assertThat(paths.path(PREFIX + "/mine/cancelled/{orderId}").path("get").path("responses").has("404")).isTrue();

        assertThat(paths.has(PREFIX + "/internal/lifecycle/expire")).isFalse();
        assertThat(paths.path(PREFIX + "/internal/lifecycle/repost").has("post")).isTrue();
        assertThat(paths.path(PREFIX + "/{id}/repost/configure").has("post")).isTrue();
        assertThat(paths.path(PREFIX + "/{id}/repost-draft").has("get")).isTrue();
        assertThat(paths.path(PREFIX + "/{id}/repost").has("post")).isTrue();
        assertThat(paths.path(PREFIX + "/commands/{id}/repost").has("post")).isTrue();
    }

    @Test
    void retiredExpiryHttpRequestDoesNotRunLifecycleProcessing() throws Exception {
        mvc.perform(post(PREFIX + "/internal/lifecycle/expire")
                .header("X-Lifecycle-Token", "test-lifecycle-token"))
            .andExpect(status().isNotFound());
        org.mockito.Mockito.verifyNoInteractions(lifecycle);
    }

    @Test
    void swaggerUsesTheCurrentOriginInsteadOfAnInternalBackendUrl() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs")
                .header("Host", "order-service-staging.example.run.app")
                .header("X-Forwarded-Host", "gateway-staging.example.run.app")
                .header("X-Forwarded-Proto", "http"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();

        JsonNode servers = mapper.readTree(json).path("servers");
        assertThat(servers.size()).isEqualTo(1);
        assertThat(servers.get(0).path("url").asString()).isEqualTo("/");
    }

    @Test
    void everyEndpointIsDocumented() throws Exception {
        String json = mvc.perform(get(PREFIX + "/v3/api-docs"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        Files.createDirectories(Path.of("target"));
        Files.writeString(Path.of("target/openapi.json"), json);

        JsonNode paths = mapper.readTree(json).path("paths");
        assertThat(paths.has("/api/orders/commands/create")).isTrue();
        assertThat(paths.path("/api/orders/admin/{orderId}/cancel").path("post").path("responses").has("403")).isTrue();
        assertThat(paths.has("/api/orders/admin/{orderId}/complete")).isFalse();
        assertThat(paths.has("/api/orders/admin/{orderId}/penalties/{penaltyId}")).isFalse();
        assertThat(paths.path("/api/orders/admin/{orderId}/apply-penalty").path("post").path("responses").has("403")).isTrue();
        assertThat(paths.path("/api/orders/admin/{orderId}/apply-penalty").path("post").path("responses").has("409")).isTrue();
        assertThat(paths.has("/api/orders/admin-mock/orders")).isFalse();
        assertThat(paths.has("/api/orders/admin-mock/users/{id}/transactions")).isFalse();
        assertThat(paths.path("/api/orders/users/{userId}/active-involvement").path("get").path("responses").has("403")).isTrue();
        assertThat(paths.path("/api/orders/suppliers/{supplierId}/active-involvement").path("get").path("parameters").toString()).contains("supplierId");
        assertThat(paths.has("/api/orders/commands/{key}/resume")).isTrue();
        JsonNode hold = paths.path("/api/orders/mine/active/{orderId}/report-holds/{reportId}").path("put");
        assertThat(hold.path("responses").has("403")).isTrue();
        assertThat(hold.path("responses").has("409")).isTrue();
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
        JsonNode personal = paths.path("/api/orders/mine").path("get");
        assertThat(personal.path("parameters").toString()).contains("status", "COMPLETED", "ABORTED");
        assertThat(personal.path("responses").has("400")).isTrue();
        JsonNode schemas = mapper.readTree(json).path("components").path("schemas");
        assertThat(schemas.path("OrderResponse").path("properties").has("isCompletionHold")).isTrue();
        assertThat(schemas.path("OrderResponse").path("properties").has("isOverdue")).isTrue();
        assertThat(schemas.path("OrderResponse").path("properties").has("deliveryDeadlineAt")).isTrue();
        assertThat(schemas.path("OrderResponse").path("properties").has("deliveredAt")).isTrue();
        assertThat(schemas.path("ActiveReportHoldResponse").path("properties").has("isCompletionHold")).isTrue();
        assertThat(schemas.path("CommandView").path("properties").has("displayDetails")).isTrue();
        assertThat(schemas.path("DisplayDetails").path("properties").propertyNames()).containsExactlyInAnyOrder(
                "itemDescription", "pickupSupplierId", "deliverySupplierId", "offeredCredits",
                "deliveryTimeLimitMinutes", "expiresAt", "orderStatus", "version");
    }
}
