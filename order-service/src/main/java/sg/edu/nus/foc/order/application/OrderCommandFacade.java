package sg.edu.nus.foc.order.application;

import java.time.Instant;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import sg.edu.nus.foc.order.domain.Order;
import sg.edu.nus.foc.order.domain.RepostPlan;

/** Inbound command boundary retained as the single dispatch point for future command IDs. */
@Service
@RequiredArgsConstructor
public class OrderCommandFacade {
    private final OrderCreationService creation;
    private final OrderAssignmentService assignment;
    private final OrderTransitionService transitions;
    private final OrderRepostService reposts;

    public Order create(
            String commandId,
            String requester,
            String description,
            String pickup,
            String delivery,
            long credits,
            int duration,
            Instant expires,
            RepostPlan repostPlan,
            String authorization) {
        return creation.create(
                commandId,
                requester,
                description,
                pickup,
                delivery,
                credits,
                duration,
                expires,
                repostPlan,
                authorization);
    }

    public Order accept(
            String commandId,
            String id,
            String actor,
            long version,
            String authorization) {
        return assignment.accept(commandId, id, actor, version, authorization);
    }

    public Order complete(
            String commandId,
            String id,
            String actor,
            long version,
            String authorization) {
        return transitions.complete(commandId, id, actor, version, authorization);
    }

    public Order cancel(
            String commandId,
            String id,
            String actor,
            long version,
            String authorization) {
        return transitions.cancel(commandId, id, actor, version, authorization);
    }

    public Order cancelAccepted(
            String commandId,
            String id,
            String actor,
            long version,
            String authorization) {
        return transitions.cancelAccepted(commandId, id, actor, version, authorization);
    }
}
