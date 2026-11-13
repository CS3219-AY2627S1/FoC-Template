package sg.edu.nus.foc.credit.messaging;

import java.util.Map;

@FunctionalInterface
public interface OrderEventPayloadDecoder {

    OrderEventMessage decode(String subscription, String payload, Map<String, String> attributes,
                             String expectedSubscription, String expectedEventType);
}
