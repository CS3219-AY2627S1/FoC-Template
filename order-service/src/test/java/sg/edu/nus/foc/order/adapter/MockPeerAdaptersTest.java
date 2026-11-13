package sg.edu.nus.foc.order.adapter;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class MockPeerAdaptersTest {
    private final MockPeerAdapters peers = new MockPeerAdapters();

    @Test
    void validatesApprovedCreditOutcomeCommands() {
        peers.reserve("order-1", "requester-1", 2, "Bearer token");
        assertEquals(new MockPeerAdapters.CreditSnapshot(50, 2, 48), peers.creditSnapshot("requester-1"));
        peers.assignCourier("order-1", "courier-1", "Bearer token");
        assertDoesNotThrow(() -> peers.settle("settle-1", "order-1", "requester-1", "courier-1", 2, "Bearer token"));
        assertEquals(new MockPeerAdapters.CreditSnapshot(48, 0, 48), peers.creditSnapshot("requester-1"));
        assertEquals(new MockPeerAdapters.CreditSnapshot(52, 0, 52), peers.creditSnapshot("courier-1"));
        assertEquals("SETTLED", peers.reservationState("order-1"));
    }

    @Test
    void rejectsInvalidCreditOutcomeCommands() {
        assertThrows(IllegalArgumentException.class, () -> peers.settle("", "order-1", "requester-1", "courier-1", 2, null));
    }

    @Test
    void holdsCreditForReopenWithoutRefundAndAllowsLaterSettlementOrRefund() {
        peers.reserve("reopen-order", "requester-reopen", 7, null);
        peers.assignCourier("reopen-order", "courier", null);

        peers.holdForReopen("reopen-order", null);

        assertEquals(new MockPeerAdapters.CreditSnapshot(50, 7, 43), peers.creditSnapshot("requester-reopen"));
        assertEquals("HELD_FOR_REOPEN", peers.reservationState("reopen-order"));
        assertNull(peers.reservationCourier("reopen-order"));
        assertDoesNotThrow(() -> peers.holdForReopen(
                "reopen-order", null));
        peers.assignCourier("reopen-order", "courier-2", null);
        assertDoesNotThrow(() -> peers.settle(
                "settle-after-reopen", "reopen-order", "requester-reopen", "courier-2", 7, null));
        assertEquals(new MockPeerAdapters.CreditSnapshot(43, 0, 43), peers.creditSnapshot("requester-reopen"));
        assertEquals(new MockPeerAdapters.CreditSnapshot(57, 0, 57), peers.creditSnapshot("courier-2"));
    }

    @Test
    void assignsReservedCreditsToOneCourierIdempotently() {
        peers.reserve("order-assign", "requester-assign", 6, null);

        peers.assignCourier("order-assign", "courier-1", null);

        assertEquals("courier-1", peers.reservationCourier("order-assign"));
        assertDoesNotThrow(() -> peers.assignCourier(
                "order-assign", "courier-1", null));
        assertThrows(IllegalStateException.class, () -> peers.assignCourier(
                "order-assign", "courier-2", null));

    }

    @Test
    void validatesIdentitySupplierAndReservationInputs() {
        assertThrows(IllegalArgumentException.class, () -> peers.verifyRequester("", null));
        assertThrows(IllegalArgumentException.class, () -> peers.verifyCourier(null, null));
        assertThrows(IllegalArgumentException.class, () -> peers.validatePair("same", "same", null));
        assertThrows(IllegalArgumentException.class, () -> peers.validatePair("", "delivery", null));
        assertThrows(IllegalArgumentException.class, () -> peers.reserve("order", "requester", 0, null));
        assertThrows(IllegalArgumentException.class, () -> peers.reserve(null, "requester", 1, null));
    }

    @Test
    void rejectsConflictingAndInsufficientReservations() {
        peers.reserve("order", "requester", 4, null);
        assertDoesNotThrow(() -> peers.reserve("order", "requester", 4, null));
        assertThrows(IllegalStateException.class, () -> peers.reserve("order", "other", 4, null));
        assertThrows(IllegalStateException.class, () -> peers.reserve("order", "requester", 5, null));
        peers.reserve("large", "requester", 46, null);
        assertThrows(IllegalStateException.class, () -> peers.reserve("too-large", "requester", 1, null));
    }

    @Test
    void rejectsInvalidSettlementMatches() {
        assertThrows(IllegalStateException.class,
            () -> peers.settle("settle", "missing", "requester", "courier", 1, null));
        peers.reserve("order", "requester", 2, null);
        assertThrows(IllegalStateException.class,
            () -> peers.settle("settle", "order", "other", "courier", 2, null));
        assertThrows(IllegalStateException.class,
            () -> peers.settle("settle", "order", "requester", "courier", 3, null));
        peers.assignCourier("order", "courier", null);
        peers.settle("settle", "order", "requester", "courier", 2, null);
        assertDoesNotThrow(() -> peers.settle("settle", "order", "requester", "courier", 2, null));
        assertThrows(IllegalStateException.class,
            () -> peers.settle("settle", "different", "requester", "courier", 2, null));

    }
}
