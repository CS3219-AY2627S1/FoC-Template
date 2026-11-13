package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.doThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.anyLong;

import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.domain.RepostPlan;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;
import sg.edu.nus.foc.order.domain.repository.OrderCheckpointRepository;
import sg.edu.nus.foc.order.domain.repository.OrderRepository;

class OrderRepostServiceTest {
    @Test
    void manualExpiryLessThanThirtyMinutesRejectsBeforePeerReservation() {
        OrderRepository orders = mock(OrderRepository.class);
        SupplierServicePort suppliers = mock(SupplierServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        UserServicePort users = mock(UserServicePort.class);
        Order original = expiredOriginal();
        when(users.verifyRequester("owner", "Bearer owner")).thenReturn("owner");
        when(orders.getForUpdate(original.getId())).thenReturn(Optional.of(original));
        when(orders.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
                mock(CommandReceiptRepository.class), suppliers, credits, users, mock(OrderAuditLogger.class), mock(RepostFailureRecorder.class));
        OrderProblem error = assertThrows(OrderProblem.class, () -> service.manual("short", original.getId(), "owner", 0,
                "item", 1, 15, Instant.now().plusSeconds(1799), "Bearer owner"));
        assertEquals("expiresAt", error.getDetails().getFirst().getField());
        assertEquals("VALIDATION_ERROR", error.getCode());
        verifyNoInteractions(suppliers, credits);
        verify(orders, never()).save(any());
    }

    @Test
    void failedNewReservationDoesNotHideOrLinkExpiredOriginal() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        Order original = expiredOriginal();
        when(users.verifyRequester("owner", "Bearer owner")).thenReturn("owner");
        when(orders.getForUpdate(original.getId())).thenReturn(Optional.of(original));
        doThrow(OrderProblem.conflict("Insufficient credits")).when(credits)
                .reserve(anyString(), anyString(), anyLong(), any());
        OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
                receipts, mock(SupplierServicePort.class), credits, users, mock(OrderAuditLogger.class), mock(RepostFailureRecorder.class));

        assertThrows(OrderProblem.class, () -> service.manual("repost", original.getId(), "owner", original.getVersion(),
                "updated", 2, 15, Instant.now().plusSeconds(3600), "Bearer owner"));

        assertEquals(null, original.getRepostedOrderId());
        assertEquals(sg.edu.nus.foc.order.domain.OrderStatus.EXPIRED, original.getStatus());
        verify(orders, never()).save(any());
        verify(receipts, never()).save(any());
    }

    @Test
    void authenticatedMatchingReplayReturnsExistingRepostWithoutReservingAgain() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        Order original = expiredOriginal();
        Instant now = Instant.now();
        Order repost = original.createRepost("updated", 2, 15, now, now.plusSeconds(3600));
        when(users.verifyRequester("owner", "Bearer owner")).thenReturn("owner");
        when(receipts.findExisting("MANUAL_REPOST", "replay"))
                .thenReturn(Optional.of(new CommandReceipt("MANUAL_REPOST", "replay", repost.getId(), now)
                        .bind("owner", CommandReceipt.fingerprint("MANUAL_REPOST", original.getId(), "owner", 0L,
                                "updated", 2L, 15, now.plusSeconds(3600)))));
        when(orders.get(repost.getId())).thenReturn(Optional.of(repost));
        OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
                receipts, mock(SupplierServicePort.class), credits, users, mock(OrderAuditLogger.class), mock(RepostFailureRecorder.class));

        assertEquals(repost, service.manual("replay", original.getId(), "owner", 0, "updated", 2, 15,
                now.plusSeconds(3600), "Bearer owner"));
        verifyNoInteractions(credits);
    }

    private Order expiredOriginal() {
        Instant now = Instant.now();
        Order original = Order.open("owner", "item", "pickup", "delivery", 1, 15,
                now.minusSeconds(7200), now.minusSeconds(3600));
        original.expire(original.getVersion(), now);
        return original;
    }

    @Test
    void manualReplayStillVerifiesRequesterBeforeReadingItsResult() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        when(users.verifyRequester("requester", "Bearer invalid"))
                .thenThrow(OrderProblem.forbidden("Unverified requester"));
        when(receipts.findExisting("MANUAL_REPOST", "replay"))
                .thenReturn(Optional.of(new CommandReceipt("MANUAL_REPOST", "replay", "new-id", Instant.now())));
        OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
                receipts, mock(SupplierServicePort.class), mock(CreditServicePort.class), users, mock(OrderAuditLogger.class), mock(RepostFailureRecorder.class));
        assertThrows(OrderProblem.class, () -> service.manual("replay", "old-id", "requester", 0,
                "item", 1, 15, Instant.now().plusSeconds(3600), "Bearer invalid"));
        verifyNoInteractions(orders);
    }

    @Test
    void manualReceiptCannotExposeAnotherRequestersRepost() {
        OrderRepository orders = mock(OrderRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        UserServicePort users = mock(UserServicePort.class);
        Instant now = Instant.now();
        Order repost = Order.open("owner", "item", "pickup", "delivery", 1, 15, now, now.plusSeconds(3600));
        when(users.verifyRequester("intruder", "Bearer intruder")).thenReturn("intruder");
        when(receipts.findExisting("MANUAL_REPOST", "replay"))
                .thenReturn(Optional.of(new CommandReceipt("MANUAL_REPOST", "replay", repost.getId(), now)));
        when(orders.get(repost.getId())).thenReturn(Optional.of(repost));
        OrderRepostService service = new OrderRepostService(orders, mock(OrderCheckpointRepository.class),
                receipts, mock(SupplierServicePort.class), mock(CreditServicePort.class), users, mock(OrderAuditLogger.class), mock(RepostFailureRecorder.class));
        OrderProblem problem = assertThrows(OrderProblem.class, () -> service.manual("replay", "old-id", "intruder", 0,
                "item", 1, 15, now.plusSeconds(3600), "Bearer intruder"));
        assertEquals("FORBIDDEN", problem.getCode());
    }

    @Test
    void configureRejectsPostCreationChanges() {
        OrderRepository orders = mock(OrderRepository.class);
        OrderCheckpointRepository checkpoints = mock(OrderCheckpointRepository.class);
        CommandReceiptRepository receipts = mock(CommandReceiptRepository.class);
        SupplierServicePort suppliers = mock(SupplierServicePort.class);
        CreditServicePort credits = mock(CreditServicePort.class);
        UserServicePort users = mock(UserServicePort.class);
        OrderAuditLogger audit = mock(OrderAuditLogger.class);
        Instant now = Instant.parse("2026-10-01T00:00:00Z");
        assertThrows(OrderProblem.class, () -> new OrderRepostService(orders, checkpoints, receipts, suppliers, credits, users, audit, mock(RepostFailureRecorder.class))
            .configure("cmd", "order-id", "requester", 0,
                new RepostPlan(true, now.plusSeconds(7200), 6, 30, now.plusSeconds(7200).plusSeconds(3600)), "Bearer token"));
    }
}
