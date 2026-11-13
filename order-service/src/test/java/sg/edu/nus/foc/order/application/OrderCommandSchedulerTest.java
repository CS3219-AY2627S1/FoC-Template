package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.order.application.recovery.OrderCommandService;

class OrderCommandSchedulerTest {
    @Test
    void sharedMinuteJobDelegatesToTheHardGatedCoordinator() {
        OrderCommandService commands = mock(OrderCommandService.class);
        LifecycleProcessingService lifecycle = mock(LifecycleProcessingService.class);

        new OrderLifecycleScheduler(lifecycle, commands).processDueOrders();

        verify(commands).recoverDue();
    }

    @Test
    void noIndependentCommandRecoveryTimerRemains() {
        assertThrows(ClassNotFoundException.class, () -> Class.forName(
                "sg.edu.nus.foc.order.application.recovery.OrderCommandRecoveryScheduler"));
    }
}
