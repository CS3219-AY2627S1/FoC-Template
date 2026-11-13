package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.adapter.MockPeerAdapters;
import sg.edu.nus.foc.order.application.recovery.*;

/** Provider protocol assumptions only, not the real Credit implementation. */
class CreditCommandStubTest {
    @Test void oldCompensationCannotReverseNewGenerationConfirmation() {
        var peers = new MockPeerAdapters(); var stub = new LocalCreditCommandStub(peers);
        var reserve = new CreditCommandGateway.Mutation("CREATE", "order", "requester", 5);
        assertTrue(stub.execute("K", reserve, 1, null).applied());
        assertTrue(stub.execute("K", reserve, 2, null).applied());
        assertFalse(stub.compensate("K", reserve, 1, null));
        assertEquals(5, peers.creditSnapshot("requester").getReserved());
    }

    @Test void replayOfOldAbortDoesNotClearLaterAcceptance() {
        var peers = new MockPeerAdapters(); var stub = new LocalCreditCommandStub(peers);
        peers.reserve("order", "requester", 5, null); peers.assignCourier("order", "courier", null);
        var reset = new CreditCommandGateway.Mutation("ABORT", "order", "courier", 0);
        stub.execute("abort-1", reset, 1, null);
        peers.assignCourier("order", "courier", null);
        assertTrue(stub.execute("abort-1", reset, 2, null).applied());
        assertEquals("courier", peers.reservationCourier("order"));
    }

    @Test void compensatedKeyStaysFencedAndInputConflictIsNotReplayed() {
        var peers = new MockPeerAdapters(); var stub = new LocalCreditCommandStub(peers);
        var reserve = new CreditCommandGateway.Mutation("CREATE", "order", "requester", 5);
        assertTrue(stub.compensate("K", reserve, 1, null));
        assertFalse(stub.execute("K", reserve, 2, null).applied());
        assertThrows(RuntimeException.class, () -> stub.execute("K", new CreditCommandGateway.Mutation("CREATE", "different", "requester", 5), 2, null));
        assertThrows(RuntimeException.class, () -> stub.execute("K", new CreditCommandGateway.Mutation("CREATE", "different", "requester", 5), 100, null));
        assertFalse(stub.compensate("K", new CreditCommandGateway.Mutation("CREATE", "different", "requester", 5), 101, null));
        // Conflicting input cannot advance another command's generation fence.
        assertFalse(stub.execute("K", reserve, 3, null).applied());
        assertEquals(0, peers.creditSnapshot("requester").getReserved());
    }
}
