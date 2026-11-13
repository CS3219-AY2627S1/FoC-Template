package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import sg.edu.nus.foc.order.application.recovery.CommandRequest;
import sg.edu.nus.foc.order.application.recovery.OrderCommandStore;
import sg.edu.nus.foc.order.domain.OrderProblem;
import tools.jackson.databind.json.JsonMapper;

class CompensationIdentifierValidationTest {
    @Test void unrepresentableKeysAndActorsNeverReachPersistenceOrCredit() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        OrderCommandStore store = new OrderCommandStore(jdbc, JsonMapper.builder().build(), mock(sg.edu.nus.foc.order.domain.repository.UserDeletionGuard.class));
        for (String invalid : java.util.Arrays.asList(null, "", " ", ".", "..", "a/b", "__reserved__", "a".repeat(129))) {
            OrderProblem keyError = assertThrows(OrderProblem.class,
                    () -> store.register(invalid, input("actor"), "COMPENSATE", 120));
            assertEquals("VALIDATION_ERROR", keyError.getCode());
            OrderProblem actorError = assertThrows(OrderProblem.class,
                    () -> store.register("K", input(invalid), "COMPENSATE", 120));
            assertEquals("VALIDATION_ERROR", actorError.getCode());
        }
        verifyNoInteractions(jdbc);
    }

    @Test void simpleAndUuidKeysStillReachNormalRegistration() {
        IllegalStateException reachedInsert = new IllegalStateException("database boundary reached");
        JdbcTemplate jdbc = mock(JdbcTemplate.class, invocation -> { throw reachedInsert; });
        OrderCommandStore store = new OrderCommandStore(jdbc, JsonMapper.builder().build(), mock(sg.edu.nus.foc.order.domain.repository.UserDeletionGuard.class));
        for (String key : java.util.List.of("12345678", java.util.UUID.randomUUID().toString())) {
            assertSame(reachedInsert, assertThrows(IllegalStateException.class,
                    () -> store.register(key, input("actor"), "COMPENSATE", 120)));
        }
    }
    private static CommandRequest input(String actor) {
        return new CommandRequest("CREATE", actor, null, 0, new CommandRequest.Creation(
                "task", "pickup", "delivery", 5, 15, Instant.now().plusSeconds(7200), false, null, 0, 0, null));
    }
}
