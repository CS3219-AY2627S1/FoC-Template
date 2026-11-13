package sg.edu.nus.foc.order.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/** Structured, service-local audit events for lifecycle and peer-boundary decisions. */
@Component
public class OrderAuditLogger {
    private static final Logger LOG = LoggerFactory.getLogger(OrderAuditLogger.class);

    public void action(String action, String orderId, String actorId, String commandId, String outcome) {
        LOG.atInfo()
                .addKeyValue("service", "order-service")
                .addKeyValue("action", action)
                .addKeyValue("orderId", orderId)
                .addKeyValue("actorId", actorId)
                .addKeyValue("commandId", commandId)
                .addKeyValue("outcome", outcome)
                .log("order_action");
    }

    public void dependency(String service, String operation, String orderId, String outcome) {
        LOG.atInfo()
                .addKeyValue("service", "order-service")
                .addKeyValue("dependency", service)
                .addKeyValue("operation", operation)
                .addKeyValue("orderId", orderId)
                .addKeyValue("outcome", outcome)
                .log("peer_dependency");
    }
}
