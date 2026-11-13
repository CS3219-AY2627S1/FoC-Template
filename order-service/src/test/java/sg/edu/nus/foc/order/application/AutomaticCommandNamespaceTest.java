package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import sg.edu.nus.foc.order.application.recovery.CommandRequest;
import sg.edu.nus.foc.order.application.recovery.OrderCommandStore;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

class AutomaticCommandNamespaceTest {
    @Test void clientCannotPreemptThePredictableSchedulerKeyWithItsOwnCommand() {
        JdbcTemplate sql = mock(JdbcTemplate.class);
        OrderCommandStore store = new OrderCommandStore(sql, JsonMapper.builder().build(), mock(sg.edu.nus.foc.order.domain.repository.UserDeletionGuard.class));
        OrderProblem invalid = assertThrows(OrderProblem.class,
                () -> store.register("AUTO_REPOST:original", new CommandRequest("CREATE", "actor", null, 0, null)));
        assertEquals("VALIDATION_ERROR", invalid.getCode());
        verifyNoInteractions(sql);
    }

    @Test void onlyServerOwnedRepostRegistrationMayUseThatNamespace() {
        IllegalStateException inserted = new IllegalStateException("reached persistence");
        JdbcTemplate sql = mock(JdbcTemplate.class, invocation -> { throw inserted; });
        OrderCommandStore store = new OrderCommandStore(sql, JsonMapper.builder().build(), mock(sg.edu.nus.foc.order.domain.repository.UserDeletionGuard.class));
        assertSame(inserted, assertThrows(IllegalStateException.class,
                () -> store.registerAutomatic("AUTO_REPOST:original", new CommandRequest("REPOST", "actor", "original", 0, null), 120)));
    }
}
