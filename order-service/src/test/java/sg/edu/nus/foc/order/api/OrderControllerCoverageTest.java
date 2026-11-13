package sg.edu.nus.foc.order.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import sg.edu.nus.foc.order.application.*;
import sg.edu.nus.foc.order.api.dto.request.CreateOrderRequest;
import sg.edu.nus.foc.order.api.dto.request.ManualRepostRequest;
import sg.edu.nus.foc.order.api.dto.request.OrderActorRequest;
import sg.edu.nus.foc.order.api.dto.request.RepostConfigurationRequest;
import sg.edu.nus.foc.order.api.dto.response.RepostDraftResponse;
import sg.edu.nus.foc.order.api.mapper.OrderMapper;
import sg.edu.nus.foc.order.domain.*;
import sg.edu.nus.foc.order.domain.repository.OrderPage;
import sg.edu.nus.foc.order.application.recovery.*;
import sg.edu.nus.foc.order.api.dto.response.OrderResponse;
import sg.edu.nus.foc.order.security.OrderReadAccessPolicy;

class OrderControllerCoverageTest {
    private static final Instant START = Instant.parse("2026-09-30T00:00:00Z");
    private static final String AUTH = "Bearer token";
    private OrderCreationService creation;
    private OrderAssignmentService assignment;
    private OrderTransitionService transitions;
    private OrderQueryService queries;
    private OrderRepostService reposts;
    private LifecycleProcessingService lifecycle;
    private UserServicePort users;
    private OrderController controller;
    private Order order;
    private OrderCommandService commands;
    private OrderMapper mapper;

    @BeforeEach
    void setUp() {
        creation = mock(OrderCreationService.class);
        assignment = mock(OrderAssignmentService.class);
        transitions = mock(OrderTransitionService.class);
        queries = mock(OrderQueryService.class);
        reposts = mock(OrderRepostService.class);
        lifecycle = mock(LifecycleProcessingService.class);
        users = mock(UserServicePort.class);
        OrderMapper orderMapper = Mappers.getMapper(OrderMapper.class);
        controller = new OrderController(
                creation,
                assignment,
                transitions,
                queries,
                reposts,
                lifecycle,
                users,
                orderMapper);
        controller.setLifecycleToken("lifecycle-secret");
        controller.setLifecycleExternalEnabled(true);
        controller.setReadAccess(mock(OrderReadAccessPolicy.class));
        commands = mock(OrderCommandService.class);
        controller.setCommands(commands);
        mapper = orderMapper;
        order = Order.open("requester", "item", "pickup", "delivery", 2, 15, START, START.plusSeconds(86400));
        when(queries.get(order.getId())).thenReturn(order);
        OrderPage page = new OrderPage(List.of(order), 0, 20, 1, 1);
        when(queries.available(anyInt(), anyInt())).thenReturn(page);
        when(queries.requestedBy(anyString(), isNull(), anyInt(), anyInt())).thenReturn(page);
        when(queries.courierFor(anyString(), isNull(), anyInt(), anyInt())).thenReturn(page);
        when(commands.submit(anyString(), any(), anyString())).thenAnswer(invocation ->
                new CommandView(invocation.getArgument(0), "CREATE", "COMPLETED", "SUCCESS", "SUCCEEDED",
                        "Done", order.getId(), 1, null, mapper.toResponse(order)));
    }

    @Test
    void createsReadsAndListsOrders() {
        when(creation.create(anyString(), anyString(), anyString(), anyString(), anyString(), anyLong(), anyInt(), any(), any(), anyString())).thenReturn(order);
        CreateOrderRequest request = new CreateOrderRequest("create", "requester", "item", "pickup", "delivery", 2, 15,
            START.plusSeconds(86400), false, null, 0, 0, null);
        assertEquals(order.getId(), ((OrderResponse) controller.create(request, AUTH).getBody()).getId());
        assertEquals(order.getId(), controller.get(order.getId()).getId());
        assertEquals(1, controller.available(1, 20).getItems().size());
        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        when(users.verifyCourier("courier", AUTH)).thenReturn("courier");
        assertEquals(1, controller.mine("requester", "requester", AUTH, 1, 20, null).getItems().size());
        assertEquals(1, controller.mine("courier", "courier", AUTH, 1, 20, null).getItems().size());
        assertThrows(OrderProblem.class, () -> controller.mine("other", "id", AUTH, 1, 20, null));
        verify(commands).submit(eq("create"), argThat(c -> c.kind().equals("CREATE")
                && c.actorId().equals("requester") && c.creation().amount() == 2), eq(AUTH));
        verifyNoInteractions(creation);
    }

    @Test
    void createsWithAutomaticRepostPlanAndDispatchesActions() {
        Instant due = START.plusSeconds(86400);
        CreateOrderRequest request = new CreateOrderRequest("create", "requester", "item", "pickup", "delivery", 2, 15,
            START.plusSeconds(86400), true, due, 3, 20, due.plusSeconds(3600));
        when(creation.create(anyString(), anyString(), anyString(), anyString(), anyString(), anyLong(), anyInt(), any(), any(), anyString())).thenReturn(order);
        controller.create(request, AUTH);
        verify(commands).submit(eq("create"), argThat(c -> c.creation().automaticRepost()
                && c.creation().repostDueAt().equals(due) && c.creation().repostCredits() == 3), eq(AUTH));

        OrderActorRequest actor = new OrderActorRequest("command", "actor", 0);
        when(assignment.accept("command", order.getId(), "actor", 0, AUTH)).thenReturn(order);
        when(transitions.start(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(transitions.pickup(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(transitions.deliver(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(transitions.complete(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(transitions.cancel(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(transitions.cancelAccepted(anyString(), eq(order.getId()), eq("actor"), eq(0L), eq(AUTH))).thenReturn(order);
        when(reposts.configure(eq("config"), eq(order.getId()), eq("actor"), eq(0L), isNull(), eq(AUTH))).thenReturn(order);
        when(commands.submit(eq("manual"), argThat(c -> c.kind().equals("REPOST") && c.orderId().equals(order.getId())), eq(AUTH)))
                .thenReturn(new CommandView("manual", "REPOST", "COMPLETED", "SUCCESS", "SUCCEEDED", "Done",
                        order.getId(), 1, Instant.now(), mapper.toResponse(order)));
        assertEquals(order.getId(), ((OrderResponse) controller.accept(order.getId(), actor, AUTH).getBody()).getId());
        assertEquals(order.getId(), controller.start(order.getId(), actor, AUTH).getId());
        assertEquals(order.getId(), controller.pickup(order.getId(), actor, AUTH).getId());
        assertEquals(order.getId(), controller.deliver(order.getId(), actor, AUTH).getId());
        assertEquals(order.getId(), controller.complete(order.getId(), actor, AUTH).getId());
        assertEquals(order.getId(), controller.cancel(order.getId(), actor, AUTH).getId());
        assertEquals(order.getId(), ((OrderResponse) controller.cancelAccepted(order.getId(), actor, AUTH).getBody()).getId());
        RepostConfigurationRequest config = new RepostConfigurationRequest("config", "actor", 0, false, START, 1, 15);
        assertEquals(order.getId(), controller.configure(order.getId(), config, AUTH).getId());
        ManualRepostRequest manual = new ManualRepostRequest("manual", "actor", 0, "item", 1, 15, START.plusSeconds(86400));
        assertEquals(order.getId(), ((OrderResponse) controller.repost(order.getId(), manual, AUTH).getBody()).getId());
        verify(reposts, never()).manual(anyString(), anyString(), anyString(), anyLong(), anyString(), anyLong(), anyInt(), any(), any());
    }

    @Test
    void draftRequiresRequesterAndExpiredOrder() {
        when(users.verifyRequester("requester", AUTH)).thenReturn("requester");
        Order expired = Order.open("requester", "item", "pickup", "delivery", 2, 15, START.minusSeconds(3600), START);
        expired.expire(0, START);
        when(queries.get("expired")).thenReturn(expired);
        RepostDraftResponse draft = controller.draft("expired", "requester", AUTH);
        assertEquals("item", draft.getItemDescription());
        assertEquals("pickup", draft.getPickupSupplierId());

        when(users.verifyRequester("other", AUTH)).thenReturn("other");
        assertThrows(OrderProblem.class, () -> controller.draft("expired", "other", AUTH));
        when(queries.get("open")).thenReturn(order);
        assertThrows(OrderProblem.class, () -> controller.draft("open", "requester", AUTH));
    }

    @Test
    void retainedRepostEndpointValidatesTokenAndReturnsCount() {
        when(lifecycle.repostDue(any(), isNull())).thenReturn(1);
        assertEquals(Map.of("reposted", 1), controller.automaticRepost("lifecycle-secret"));
        assertThrows(OrderProblem.class, () -> controller.automaticRepost("wrong"));
        assertThrows(OrderProblem.class, () -> controller.automaticRepost(null));
    }

    @Test
    void cloudNeverAcceptsThePublicLocalLifecycleToken() {
        controller.setLifecycleEnvironment("staging");
        controller.setLifecycleExternalEnabled(false);
        controller.setLifecycleToken("local-lifecycle");
        assertThrows(OrderProblem.class, () -> controller.automaticRepost("local-lifecycle"));
        verifyNoInteractions(lifecycle);
    }

    @Test void legacyMutationRoutesUseDurableCoordinatorAndRetainPendingStatus() {
        OrderActorRequest actor = new OrderActorRequest("pending", "courier", 7);
        CommandView pending = new CommandView("pending", "ACCEPT", "PENDING", null, "RETRY_SCHEDULED",
                "Please wait", order.getId(), 1, Instant.now(), null);
        when(commands.submit(eq("pending"), any(), eq(AUTH))).thenReturn(pending);
        assertEquals(202, controller.accept(order.getId(), actor, AUTH).getStatusCode().value());
        assertEquals(pending, controller.cancelAccepted(order.getId(), actor, AUTH).getBody());
        verify(commands).submit(eq("pending"), eq(new CommandRequest("ACCEPT", "courier", order.getId(), 7, null)), eq(AUTH));
        verify(commands).submit(eq("pending"), eq(new CommandRequest("ABORT", "courier", order.getId(), 7, null)), eq(AUTH));
        verifyNoInteractions(assignment, transitions);
        when(commands.submit(eq("pending"), any(), eq(AUTH))).thenReturn(new CommandView("pending", "ACCEPT",
                "COMPLETED", "REJECTED", "CONFLICT", "Rejected", order.getId(), 1, null, null));
        assertEquals("CONFLICT", assertThrows(OrderProblem.class,
                () -> controller.accept(order.getId(), actor, AUTH)).getCode());
    }
}
