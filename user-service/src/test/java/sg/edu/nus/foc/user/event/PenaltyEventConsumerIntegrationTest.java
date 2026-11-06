
package sg.edu.nus.foc.user.event;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Query;

import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import tools.jackson.databind.json.JsonMapper;

import sg.edu.nus.foc.user.authentication.FirebaseAuthService;
import sg.edu.nus.foc.user.dto.PubSubMessage;
import sg.edu.nus.foc.user.dto.PubSubPushRequest;
import sg.edu.nus.foc.user.logic.OrderServiceClient;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.ProcessedPenaltyEvent;
import sg.edu.nus.foc.user.model.User;
import sg.edu.nus.foc.user.repository.UserRepository;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = {
        "firebase.auth.project-id=demo-foc",
        "firebase.auth.emulator-host=localhost:9099",

        "FOC_ENVIRONMENT=local",
        "USER_PUBSUB_PUSH_MODE=emulator",
        "PUBSUB_EMULATOR_HOST=localhost:8085",

        "order-service.url=http://localhost:8082"
})
@Testcontainers
class PenaltyEventConsumerIntegrationTest {

    private static final String ADDITION_EVENT =
            "PenaltyScoreAdditionEvent";

    private static final String DEDUCTION_EVENT =
            "PenaltyScoreDeductionEvent";

    private static final String EVENT_VERSION = "1";

    @Container
    static final MongoDBContainer mongo =
            new MongoDBContainer("mongo:7.0");

    @DynamicPropertySource
    static void mongoProperties(DynamicPropertyRegistry registry) {
        String mongoUri = mongo.getReplicaSetUrl();

        registry.add("spring.mongodb.uri", () -> mongoUri);
        registry.add("spring.data.mongodb.uri", () -> mongoUri);
    }

    @Autowired
    private PenaltyEventConsumer penaltyEventConsumer;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private MongoTemplate mongoTemplate;

    @Autowired
    private JsonMapper jsonMapper;

    @MockitoBean
    private FirebaseAuthService firebaseAuthService;

    @MockitoBean
    private OrderServiceClient orderServiceClient;

    @BeforeEach
    void setUp() {
        mongoTemplate.remove(
                new Query(),
                ProcessedPenaltyEvent.class
        );

        userRepository.deleteAll();
    }

    // ---------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------

    private User createCourier(String courierId, int initialPenalty) {
        User courier = new User();

        courier.setUserId(courierId);
        courier.setUsername("test-courier");
        courier.setEmail(courierId + "@example.com");
        courier.setRoles(List.of("courier"));
        courier.setPenalty(initialPenalty);
        courier.setStatus(AccountStatus.ACTIVE);

        return userRepository.save(courier);
    }

    private PenaltyScoreEvent createAdditionEvent(
            String eventId,
            String courierId,
            int amount,
            String reason
    ) {
        return new PenaltyScoreEvent(
                eventId,
                ADDITION_EVENT,
                "order-123",
                courierId,
                amount,
                Instant.parse("2026-11-06T10:00:00Z"),
                reason
        );
    }

    private PenaltyScoreEvent createDeductionEvent(
            String eventId,
            String courierId,
            int amount,
            String reason
    ) {
        return new PenaltyScoreEvent(
                eventId,
                DEDUCTION_EVENT,
                "order-123",
                courierId,
                amount,
                Instant.parse("2026-11-06T10:00:00Z"),
                reason
        );
    }

    private PubSubPushRequest createRequest(
            PenaltyScoreEvent event
    ) throws Exception {

        String json = jsonMapper.writeValueAsString(event);

        String encodedData = Base64.getEncoder()
                .encodeToString(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));

        return createRequest(
                encodedData,
                Map.of(
                        "eventId", event.eventId(),
                        "eventType", event.eventType(),
                        "eventVersion", EVENT_VERSION
                )
        );
    }

    private PubSubPushRequest createRequest(
            String encodedData,
            Map<String, String> attributes
    ) {
        PubSubMessage message = new PubSubMessage(
                encodedData,
                attributes,
                "pubsub-message-123",
                "2026-11-06T10:00:00Z"
        );

        return new PubSubPushRequest(
                message,
                "projects/demo-foc/subscriptions/test-subscription"
        );
    }

    private long processedEventCount() {
        return mongoTemplate.count(
                new Query(),
                ProcessedPenaltyEvent.class
        );
    }

    private ProcessedPenaltyEvent findProcessedEvent(String eventId) {
        return mongoTemplate.findById(
                eventId,
                ProcessedPenaltyEvent.class
        );
    }

    // ---------------------------------------------------------
    // Addition
    // ---------------------------------------------------------

    @Test
    void consumeAddition_increasesCourierPenalty() throws Exception {
        createCourier("courier-1", 1);

        PenaltyScoreEvent event = createAdditionEvent(
                "event-add-1",
                "courier-1",
                2,
                "ACCEPTED_TASK_CANCELLATION"
        );

        penaltyEventConsumer.consumeAddition(
                createRequest(event)
        );

        User updatedCourier = userRepository
                .findByUserId("courier-1")
                .orElseThrow();

        assertThat(updatedCourier.getPenalty()).isEqualTo(3);

        assertThat(processedEventCount()).isEqualTo(1);

        ProcessedPenaltyEvent processed =
                findProcessedEvent("event-add-1");

        assertThat(processed).isNotNull();
        assertThat(processed.getEventId()).isEqualTo("event-add-1");
        assertThat(processed.getCourierId()).isEqualTo("courier-1");
        assertThat(processed.getEventType()).isEqualTo(ADDITION_EVENT);
    }

    // ---------------------------------------------------------
    // Deduction
    // ---------------------------------------------------------

    @Test
    void consumeDeduction_decreasesCourierPenalty() throws Exception {
        createCourier("courier-1", 3);

        PenaltyScoreEvent event = createDeductionEvent(
                "event-deduct-1",
                "courier-1",
                1,
                "SUCCESSFUL_DELIVERY"
        );

        penaltyEventConsumer.consumeDeduction(
                createRequest(event)
        );

        User updatedCourier = userRepository
                .findByUserId("courier-1")
                .orElseThrow();

        assertThat(updatedCourier.getPenalty()).isEqualTo(2);

        assertThat(processedEventCount()).isEqualTo(1);

        ProcessedPenaltyEvent processed =
                findProcessedEvent("event-deduct-1");

        assertThat(processed).isNotNull();
        assertThat(processed.getCourierId()).isEqualTo("courier-1");
        assertThat(processed.getEventType()).isEqualTo(DEDUCTION_EVENT);
    }

    @Test
    void consumeDeduction_doesNotReducePenaltyBelowZero()
            throws Exception {

        createCourier("courier-1", 0);

        PenaltyScoreEvent event = createDeductionEvent(
                "event-deduct-2",
                "courier-1",
                1,
                "SUCCESSFUL_DELIVERY"
        );

        penaltyEventConsumer.consumeDeduction(
                createRequest(event)
        );

        User updatedCourier = userRepository
                .findByUserId("courier-1")
                .orElseThrow();

        assertThat(updatedCourier.getPenalty()).isZero();
        assertThat(processedEventCount()).isEqualTo(1);
    }

    // ---------------------------------------------------------
    // Duplicate event handling
    // ---------------------------------------------------------

    @Test
    void consumeAddition_duplicateEventDoesNotApplyPenaltyTwice()
            throws Exception {

        createCourier("courier-1", 1);

        PenaltyScoreEvent event = createAdditionEvent(
                "event-duplicate-1",
                "courier-1",
                2,
                "ACCEPTED_TASK_CANCELLATION"
        );

        PubSubPushRequest request = createRequest(event);

        // First delivery
        penaltyEventConsumer.consumeAddition(request);

        // Duplicate delivery
        penaltyEventConsumer.consumeAddition(request);

        User updatedCourier = userRepository
                .findByUserId("courier-1")
                .orElseThrow();

        // Penalty must only be increased once.
        assertThat(updatedCourier.getPenalty()).isEqualTo(3);

        // Only one processed event should exist.
        assertThat(processedEventCount()).isEqualTo(1);
    }

    @Test
    void consumeDeduction_duplicateEventDoesNotApplyDeductionTwice()
            throws Exception {

        createCourier("courier-1", 3);

        PenaltyScoreEvent event = createDeductionEvent(
                "event-duplicate-2",
                "courier-1",
                1,
                "SUCCESSFUL_DELIVERY"
        );

        PubSubPushRequest request = createRequest(event);

        penaltyEventConsumer.consumeDeduction(request);
        penaltyEventConsumer.consumeDeduction(request);

        User updatedCourier = userRepository
                .findByUserId("courier-1")
                .orElseThrow();

        assertThat(updatedCourier.getPenalty()).isEqualTo(2);
        assertThat(processedEventCount()).isEqualTo(1);
    }

    // ---------------------------------------------------------
    // Event validation
    // ---------------------------------------------------------

    @Test
    void consumeAddition_wrongEventTypeReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createDeductionEvent(
                "event-invalid-1",
                "courier-1",
                1,
                "SUCCESSFUL_DELIVERY"
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(
                        createRequest(event)
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_mismatchedEventIdReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createAdditionEvent(
                "event-invalid-2",
                "courier-1",
                2,
                "ACCEPTED_TASK_CANCELLATION"
        );

        PubSubPushRequest request = createRequest(
                jsonMapper.writeValueAsString(event)
                        .getBytes(java.nio.charset.StandardCharsets.UTF_8)
                        .length > 0
                        ? Base64.getEncoder().encodeToString(
                                jsonMapper.writeValueAsString(event)
                                        .getBytes(java.nio.charset.StandardCharsets.UTF_8))
                        : "",
                Map.of(
                        "eventId", "different-event-id",
                        "eventType", ADDITION_EVENT,
                        "eventVersion", EVENT_VERSION
                )
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(request)
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_unsupportedEventVersionReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createAdditionEvent(
                "event-invalid-3",
                "courier-1",
                2,
                "ACCEPTED_TASK_CANCELLATION"
        );

        String json = jsonMapper.writeValueAsString(event);

        String encodedData = Base64.getEncoder().encodeToString(
                json.getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );

        PubSubPushRequest request = createRequest(
                encodedData,
                Map.of(
                        "eventId", event.eventId(),
                        "eventType", event.eventType(),
                        "eventVersion", "2"
                )
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(request)
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_invalidPenaltyAmountReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createAdditionEvent(
                "event-invalid-4",
                "courier-1",
                5,
                "ACCEPTED_TASK_CANCELLATION"
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(
                        createRequest(event)
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_unknownPenaltyReasonReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createAdditionEvent(
                "event-invalid-5",
                "courier-1",
                2,
                "UNKNOWN_REASON"
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(
                        createRequest(event)
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_deprecatedPenaltyReasonReturnsBadRequest()
            throws Exception {

        PenaltyScoreEvent event = createAdditionEvent(
                "event-invalid-6",
                "courier-1",
                3,
                "COURIER_UNRESPONSIVE"
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(
                        createRequest(event)
                )
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    @Test
    void consumeAddition_invalidBase64ReturnsBadRequest() {
        PubSubPushRequest request = createRequest(
                "invalid-base64%%%",
                Map.of(
                        "eventId", "event-invalid-7",
                        "eventType", ADDITION_EVENT,
                        "eventVersion", EVENT_VERSION
                )
        );

        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(request)
        );

        assertThat(exception.getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThat(processedEventCount()).isZero();
    }

    // ---------------------------------------------------------
    // Processing failures
    // ---------------------------------------------------------

    @Test
    void consumeAddition_missingCourierDoesNotKeepProcessedEvent()
            throws Exception {

        // Do not create courier-1.

        PenaltyScoreEvent event = createAdditionEvent(
                "event-missing-courier",
                "courier-1",
                2,
                "ACCEPTED_TASK_CANCELLATION"
        );

        assertThrows(
                ResponseStatusException.class,
                () -> penaltyEventConsumer.consumeAddition(
                        createRequest(event)
                )
        );

        // The event insert and penalty update should be atomic.
        // If updating the courier fails, the inserted event must roll back.
        assertThat(processedEventCount()).isZero();
    }
}

