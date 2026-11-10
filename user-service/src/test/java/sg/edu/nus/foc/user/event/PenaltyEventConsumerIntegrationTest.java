/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code and provided testing assistance.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.event;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
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
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(properties = {
        "firebase.auth.project-id=demo-foc",
        "firebase.auth.emulator-host=localhost:9099",

        "FOC_ENVIRONMENT=local",
        "USER_PUBSUB_PUSH_MODE=emulator",
        "PUBSUB_EMULATOR_HOST=localhost:8085",

        "order-service.url=http://localhost:8082",
        "USER_PENALTY_SEQUENCE_RECOVERY_DELAY_MS=3600000"
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

    @Autowired private PenaltySequenceStore sequenceStore;
    @Autowired private SequencedPenaltyProcessor sequenceProcessor;
    @Autowired private sg.edu.nus.foc.user.config.UserPushProperties push;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    private sg.edu.nus.foc.user.logic.UserService scoredUsers;

    @MockitoBean
    private FirebaseAuthService firebaseAuthService;

    @MockitoBean
    private OrderServiceClient orderServiceClient;

    @BeforeEach
    void setUp() {
        org.mockito.Mockito.reset(scoredUsers);
        mongoTemplate.remove(new Query(), sg.edu.nus.foc.user.model.CourierPenaltyStream.class);
        mongoTemplate.remove(new Query(), sg.edu.nus.foc.user.model.PenaltyInboxItem.class);
        mongoTemplate.remove(new Query(), sg.edu.nus.foc.user.model.PenaltyEventReceipt.class);
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
        courier.setEmail(courierId + "@u.nus.edu");
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

    private PubSubPushRequest createRequest(PenaltyScoreEvent event) throws Exception {

        String json = jsonMapper.writeValueAsString(event);

        return createRequest(
                json,
                Map.of(
                        "eventId", event.eventId(),
                        "eventType", event.eventType(),
                        "eventVersion", EVENT_VERSION
                )
        );
    }

    private PubSubPushRequest createRequest(PenaltyScoreEvent event, Map<String, String> attributes) throws Exception {
        return createRequest(jsonMapper.writeValueAsString(event), attributes);
    }

    // Accepts raw JSON and encodes it into Base64.
    private PubSubPushRequest createRequest(String json, Map<String, String> attributes) {
        String encodedData = Base64.getEncoder().encodeToString(
                json.getBytes(java.nio.charset.StandardCharsets.UTF_8)
        );

        return createRequestWithEncodedData(encodedData, attributes);
    }

    // Accepts data that is already Base64-encoded.
    private PubSubPushRequest createRequestWithEncodedData(String encodedData, Map<String, String> attributes) {
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
                event,
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

        PubSubPushRequest request = createRequest(
                event,
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
        PubSubPushRequest request = createRequestWithEncodedData(
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

    // --------------------------------------------------
    // decodeEvent() validation
    // --------------------------------------------------

    @Test
    void rejectsNullPubSubRequest() {
        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(null),
                "Missing Pub/Sub message"
        );
    }

    @Test
    void rejectsMissingPubSubMessage() {
        PubSubPushRequest request = new PubSubPushRequest(null, null);

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Missing Pub/Sub message"
        );
    }

    @Test
    void rejectsMissingMessageData() {
        PubSubPushRequest request = new PubSubPushRequest(
                new PubSubMessage(null, validAttributes(), "message-1", null),
                null
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Missing Pub/Sub message data"
        );
    }

    @Test
    void rejectsBlankMessageData() {
        PubSubPushRequest request = new PubSubPushRequest(
                new PubSubMessage("   ", validAttributes(), "message-1", null),
                null
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Missing Pub/Sub message data"
        );
    }

    @Test
    void rejectsInvalidBase64Payload() {
        PubSubPushRequest request = createRequestWithEncodedData("invalid-base64!!!", validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Invalid penalty event payload"
        );
    }

    @Test
    void rejectsInvalidJsonPayload() {
        PubSubPushRequest request = createRequest(
                "{ invalid json",
                validAttributes()
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Invalid penalty event payload"
        );
    }

    @Test
    void rejectsNullEventPayload() {
        PubSubPushRequest request = createRequest(
                "null",
                validAttributes()
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Penalty event cannot be null"
        );
    }

    // --------------------------------------------------
    // validateEvent() required fields
    // --------------------------------------------------

    @Test
    void rejectsEventWithMissingRequiredFields() {
        String json = """
                {
                    "eventId": "event-1",
                    "eventType": "PenaltyScoreAdditionEvent",
                    "orderId": null,
                    "courierId": "courier-1",
                    "penaltyAmount": 2,
                    "occurredAt": "2026-11-06T10:00:00Z",
                    "appliedReason": "ACCEPTED_TASK_CANCELLATION"
                }
                """;

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Penalty event contains missing fields"
        );
    }

    // --------------------------------------------------
    // validateEvent() event type and amount
    // --------------------------------------------------

    @Test
    void rejectsUnexpectedEventType() {
        String json = validAdditionEventJson()
                .replace(
                        "PenaltyScoreAdditionEvent",
                        "PenaltyScoreDeductionEvent"
                );

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Unexpected penalty event type"
        );
    }

    @Test
    void rejectsNonPositivePenaltyAmount() {
        String json = validAdditionEventJson()
                .replace("\"penaltyAmount\": 2", "\"penaltyAmount\": 0");

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Penalty amount must be positive"
        );
    }

    // --------------------------------------------------
    // validateEvent() Pub/Sub attributes
    // --------------------------------------------------

    @Test
    void rejectsMissingPubSubAttributes() {
        PubSubPushRequest request = createRequest(
                validAdditionEventJson(),
                null
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Missing Pub/Sub message attributes"
        );
    }

    @Test
    void rejectsMismatchedEventId() {
        Map<String, String> attributes = Map.of(
                "eventId", "different-event",
                "eventType", "PenaltyScoreAdditionEvent",
                "eventVersion", "1"
        );

        PubSubPushRequest request = createRequest(
                validAdditionEventJson(),
                attributes
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Event ID does not match Pub/Sub attributes"
        );
    }

    @Test
    void rejectsMismatchedEventTypeAttribute() {
        Map<String, String> attributes = Map.of(
                "eventId", "event-1",
                "eventType", "WrongEventType",
                "eventVersion", "1"
        );

        PubSubPushRequest request = createRequest(
                validAdditionEventJson(),
                attributes
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Event type does not match Pub/Sub attributes"
        );
    }

    @Test
    void rejectsUnsupportedEventVersion() {
        Map<String, String> attributes = Map.of(
                "eventId", "event-1",
                "eventType", "PenaltyScoreAdditionEvent",
                "eventVersion", "2"
        );

        PubSubPushRequest request = createRequest(
                validAdditionEventJson(),
                attributes
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Unsupported penalty event version"
        );
    }

    // --------------------------------------------------
    // validatePolicy() validation
    // --------------------------------------------------

    @Test
    void rejectsUnknownPenaltyReason() {
        String json = validAdditionEventJson()
                .replace(
                        "ACCEPTED_TASK_CANCELLATION",
                        "UNKNOWN_REASON"
                );

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Unknown penalty reason"
        );
    }

    @Test
    void rejectsDeprecatedPenaltyReason() {
        String json = validAdditionEventJson()
                .replace(
                        "ACCEPTED_TASK_CANCELLATION",
                        "COURIER_UNRESPONSIVE"
                );

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Deprecated penalty reason cannot be published"
        );
    }

    @Test
    void rejectsInvalidReasonForDeduction() {
        PubSubPushRequest request = createRequest(
                validAdditionEventJson(),
                validAttributes()
        );

        assertBadRequest(
                () -> penaltyEventConsumer.consumeDeduction(request),
                "Unexpected penalty event type"
        );
    }

    @Test
    void rejectsSuccessfulDeliveryAsAddition() {
        String json = validAdditionEventJson()
                .replace(
                        "ACCEPTED_TASK_CANCELLATION",
                        "SUCCESSFUL_DELIVERY"
                )
                .replace("\"penaltyAmount\": 2", "\"penaltyAmount\": 1");

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Successful delivery must use deduction event"
        );
    }

    @Test
    void rejectsPenaltyAmountThatDoesNotMatchPolicy() {
        String json = validAdditionEventJson()
                .replace("\"penaltyAmount\": 2", "\"penaltyAmount\": 3");

        PubSubPushRequest request = createRequest(json, validAttributes());

        assertBadRequest(
                () -> penaltyEventConsumer.consumeAddition(request),
                "Penalty amount does not match policy"
        );
    }

    @Test
    void rejectsInvalidReasonForDeductionEvent() {
        String json = validAdditionEventJson()
                .replace(
                        "PenaltyScoreAdditionEvent",
                        "PenaltyScoreDeductionEvent"
                );

        PubSubPushRequest request = createRequest(json, Map.of(
                "eventId", "event-1",
                "eventType", "PenaltyScoreDeductionEvent",
                "eventVersion", "1"
        ));

        assertBadRequest(
                () -> penaltyEventConsumer.consumeDeduction(request),
                "Invalid reason for penalty deduction"
        );
    }

    // Helper functions

    private void assertBadRequest(Runnable action, String expectedMessage) {
        ResponseStatusException exception = assertThrows(
                ResponseStatusException.class,
                action::run
        );

        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
        assertEquals(expectedMessage, exception.getReason());
    }

    private String validAdditionEventJson() {
        return """
                {
                    "eventId": "event-1",
                    "eventType": "PenaltyScoreAdditionEvent",
                    "orderId": "order-1",
                    "courierId": "courier-1",
                    "penaltyAmount": 2,
                    "occurredAt": "2026-11-06T10:00:00Z",
                    "appliedReason": "ACCEPTED_TASK_CANCELLATION"
                }
                """;
    }

    private PenaltyScoreEvent sequencedEvent(String id, String courier, long sequence, boolean reward) {
        return new PenaltyScoreEvent(id, reward ? DEDUCTION_EVENT : ADDITION_EVENT, "order-" + id,
                courier, reward ? 1 : 2, Instant.parse("2026-11-10T00:00:00.123456789Z"),
                reward ? "SUCCESSFUL_DELIVERY" : "COURIER_BAD_ATTITUDE", sequence);
    }

    private void deliver(PenaltyScoreEvent event) {
        var message = new PubSubMessage(Base64.getEncoder().encodeToString(jsonMapper.writeValueAsBytes(event)),
                Map.of("eventId",event.eventId(),"eventType",event.eventType(),"eventVersion","2"), "broker-"+event.eventId(), null);
        penaltyEventConsumer.consume(new PubSubPushRequest(message, push.penaltyEventSubscriptionPath()));
    }

    @Test void reversedArrivalRetainsRewardUntilEarlierAdditionAndAppliesDuplicatesOnce() {
        createCourier("sequence-courier",0);
        var first=sequencedEvent("seq-one","sequence-courier",1,false);
        var second=sequencedEvent("seq-two","sequence-courier",2,true);
        deliver(second);
        assertEquals(0,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
        assertEquals(0,mongoTemplate.count(new Query(),ProcessedPenaltyEvent.class));
        deliver(first); deliver(second); deliver(first);
        assertEquals(1,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
        assertEquals(2,mongoTemplate.count(new Query(),ProcessedPenaltyEvent.class));
        assertEquals(2,mongoTemplate.findById("sequence-courier",sg.edu.nus.foc.user.model.CourierPenaltyStream.class).lastAppliedSequence());
    }

    @Test void rejectsConflictingEventIdentityAndSequencePosition() {
        createCourier("sequence-courier",0);
        deliver(sequencedEvent("seq-one","sequence-courier",1,false));
        assertThrows(ResponseStatusException.class,()->deliver(sequencedEvent("different","sequence-courier",1,false)));
        assertThrows(ResponseStatusException.class,()->deliver(sequencedEvent("seq-one","sequence-courier",2,false)));
        assertEquals(2,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
    }

    @Test void recoveryDrainsReceiptsSavedBeforeCrashAndGapsDoNotBlockAnotherCourier() {
        createCourier("sequence-courier",0);createCourier("other-courier",0);
        sequenceStore.accept(sequencedEvent("seq-two","sequence-courier",2,true));
        deliver(sequencedEvent("other-one","other-courier",1,false));
        sequenceProcessor.recover();
        assertEquals(0,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
        assertEquals(2,userRepository.findByUserId("other-courier").orElseThrow().getPenalty());
        sequenceStore.accept(sequencedEvent("seq-one","sequence-courier",1,false));
        sequenceProcessor.recover();
        assertEquals(1,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
    }

    @Test void failedRecoveryBatchMovesBehindOtherPendingCouriers() {
        for (int index = 0; index < 51; index++) {
            mongoTemplate.insert(new sg.edu.nus.foc.user.model.CourierPenaltyStream(
                    "pending-" + index, 0, true, true, Instant.EPOCH));
        }
        var firstBatch = sequenceStore.pendingStreams();
        assertEquals(50, firstBatch.size());
        String waiting = java.util.stream.IntStream.range(0, 51).mapToObj(index -> "pending-" + index)
                .filter(courier -> !firstBatch.contains(courier)).findFirst().orElseThrow();
        firstBatch.forEach(sequenceStore::deferRetry);
        assertEquals(waiting, sequenceStore.pendingStreams().getFirst());
    }

    @Test void failedScoreTransactionKeepsReceiptButRollsBackCursorAndProcessedMarker() {
        createCourier("sequence-courier",0);
        org.mockito.Mockito.doThrow(new IllegalStateException("score failed")).when(scoredUsers).adjustPenalty("sequence-courier",2);
        deliver(sequencedEvent("seq-one","sequence-courier",1,false));
        assertEquals(1,mongoTemplate.count(new Query(),sg.edu.nus.foc.user.model.PenaltyEventReceipt.class));
        assertEquals(0,mongoTemplate.count(new Query(),ProcessedPenaltyEvent.class));
        assertEquals(0,mongoTemplate.findById("sequence-courier",sg.edu.nus.foc.user.model.CourierPenaltyStream.class).lastAppliedSequence());
        org.mockito.Mockito.reset(scoredUsers);
        sequenceProcessor.recover();
        assertEquals(2,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
        assertEquals(1,mongoTemplate.count(new Query(),ProcessedPenaltyEvent.class));
    }

    @Test void lateLegacyFirstDeliveryCannotReorderSequencedStreamButKnownDuplicateIsSafe() throws Exception {
        createCourier("sequence-courier",0);
        var legacy=createAdditionEvent("old-event","sequence-courier",2,"ACCEPTED_TASK_CANCELLATION");
        penaltyEventConsumer.consumeAddition(createRequest(legacy));
        deliver(sequencedEvent("seq-one","sequence-courier",1,true));
        penaltyEventConsumer.consumeAddition(createRequest(legacy));
        assertThrows(ResponseStatusException.class,()->penaltyEventConsumer.consumeAddition(createRequest(
                createAdditionEvent("late-old-event","sequence-courier",2,"ACCEPTED_TASK_CANCELLATION"))));
        assertEquals(1,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
    }

    @Test void twoConsumerInstancesCannotCommitTheSamePositionTwice() throws Exception {
        createCourier("sequence-courier",0);
        sequenceStore.accept(sequencedEvent("seq-one","sequence-courier",1,false));
        sequenceStore.accept(sequencedEvent("seq-two","sequence-courier",2,true));
        var workers=java.util.concurrent.Executors.newFixedThreadPool(2);
        var start=new java.util.concurrent.CountDownLatch(1);
        try {
            var jobs=new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for(int i=0;i<2;i++)jobs.add(workers.submit(()->{
                try { start.await(); sequenceStore.applyNext("sequence-courier"); }
                catch (org.springframework.dao.DataAccessException expectedTransactionConflict) { }
                catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new RuntimeException(interrupted); }
            }));
            start.countDown();for(var job:jobs)job.get(15,java.util.concurrent.TimeUnit.SECONDS);
        } finally { workers.shutdownNow(); }
        sequenceProcessor.recover();
        assertEquals(1,userRepository.findByUserId("sequence-courier").orElseThrow().getPenalty());
        assertEquals(2,mongoTemplate.count(new Query(),ProcessedPenaltyEvent.class));
    }

    private Map<String, String> validAttributes() {
        return Map.of(
                "eventId", "event-1",
                "eventType", "PenaltyScoreAdditionEvent",
                "eventVersion", "1"
        );
    }
}

