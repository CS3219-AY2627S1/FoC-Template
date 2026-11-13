package sg.edu.nus.foc.order.api;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mapstruct.factory.Mappers;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.application.CreditServicePort;
import sg.edu.nus.foc.order.application.LifecycleProcessingService;
import sg.edu.nus.foc.order.application.OrderAssignmentService;
import sg.edu.nus.foc.order.application.OrderAuditLogger;
import sg.edu.nus.foc.order.application.OrderCreationService;
import sg.edu.nus.foc.order.application.OrderQueryService;
import sg.edu.nus.foc.order.application.OrderRepostService;
import sg.edu.nus.foc.order.application.OrderTransitionService;
import sg.edu.nus.foc.order.application.SupplierServicePort;
import sg.edu.nus.foc.order.application.UserServicePort;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderCreationExpiryApiTest {

    private static final String AUTHORIZATION = "Bearer requester";

    private MockMvc mvc;
    private UserServicePort users;
    private SupplierServicePort suppliers;
    private CreditServicePort credits;
    private OrderRepository orders;
    private CommandReceiptRepository receipts;
    private OrderCheckpointRepository checkpoints;
    private OrderAuditLogger audit;

    @BeforeEach
    void setUp() {
        users = mock(UserServicePort.class);
        suppliers = mock(SupplierServicePort.class);
        credits = mock(CreditServicePort.class);
        orders = mock(OrderRepository.class);
        receipts = mock(CommandReceiptRepository.class);
        checkpoints = mock(OrderCheckpointRepository.class);
        audit = mock(OrderAuditLogger.class);
        when(users.verifyRequester("requester", AUTHORIZATION)).thenReturn("requester");
        OrderCreationService creation = new OrderCreationService(
                orders, receipts, checkpoints, users, suppliers, credits, audit);
        OrderController controller = new OrderController(
                creation, mock(OrderAssignmentService.class), mock(OrderTransitionService.class),
                mock(OrderQueryService.class), mock(OrderRepostService.class),
                mock(LifecycleProcessingService.class), users, Mappers.getMapper(OrderMapper.class));
        sg.edu.nus.foc.order.application.recovery.OrderCommandService commands = mock(sg.edu.nus.foc.order.application.recovery.OrderCommandService.class);
        controller.setCommands(commands);
        when(commands.submit(any(), any(), any())).thenAnswer(invocation -> {
            sg.edu.nus.foc.order.application.recovery.CommandRequest input = invocation.getArgument(1);
            sg.edu.nus.foc.order.application.recovery.CommandRequest.Creation fields = input.creation();
            Order result = creation.create(invocation.getArgument(0), input.actorId(), fields.description(),
                    fields.pickup(), fields.delivery(), fields.amount(), fields.duration(), fields.expiresAt(), fields.plan(), invocation.getArgument(2));
            return new sg.edu.nus.foc.order.application.recovery.CommandView(invocation.getArgument(0), "CREATE", "COMPLETED",
                    "SUCCESS", "SUCCEEDED", "Done", result.getId(), 1, null, Mappers.getMapper(OrderMapper.class).toResponse(result));
        });
        mvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new OrderExceptionHandler())
                .build();
    }

    @ParameterizedTest
    @ValueSource(longs = {-1, 0, 60, 1799})
    void directCreateRejectsExpiryBeforeServerMinimumWithoutReservingCredits(long secondsFromNow)
            throws Exception {
        Instant expiry = Instant.now().plusSeconds(secondsFromNow);

        mvc.perform(post("/api/orders")
                .header("Authorization", AUTHORIZATION)
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody(expiry)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details.length()").value(1))
                .andExpect(jsonPath("$.details[0].field").value("expiresAt"))
                .andExpect(jsonPath("$.details[0].message").value(
                        "Order expiry must be at least 30 minutes from now. Choose a later time."));

        verify(users).verifyRequester("requester", AUTHORIZATION);
        verifyNoInteractions(suppliers, credits, orders, checkpoints, audit);
        verify(receipts, never()).save(any(CommandReceipt.class));
    }

    @Test
    void validExpiryStillCreatesAnOpenOrderAndReservesCredits() throws Exception {
        Instant expiry = Instant.now().plusSeconds(3600);
        when(orders.save(any(Order.class))).thenAnswer(invocation -> invocation.getArgument(0, Order.class));

        mvc.perform(post("/api/orders")
                .header("Authorization", AUTHORIZATION)
                .contentType(MediaType.APPLICATION_JSON)
                .content(requestBody(expiry)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.expiresAt").value(expiry.toString()));

        verify(suppliers).validatePair("pickup", "delivery", AUTHORIZATION);
        verify(credits).reserve(any(String.class), eq("requester"),
                eq(2L), eq(AUTHORIZATION));
        verify(orders).save(any(Order.class));
        verify(receipts).save(any(CommandReceipt.class));
    }

    private String requestBody(Instant expiry) {
        return """
                {
                  "commandId": "create-command",
                  "requesterId": "requester",
                  "itemDescription": "item",
                  "pickupSupplierId": "pickup",
                  "deliverySupplierId": "delivery",
                  "offeredCredits": 2,
                  "deliveryTimeLimitMinutes": 15,
                  "expiresAt": "%s",
                  "automaticRepost": false,
                  "repostCreditAmount": 0,
                  "repostDeliveryDurationMinutes": 0
                }
                """.formatted(expiry);
    }
}
