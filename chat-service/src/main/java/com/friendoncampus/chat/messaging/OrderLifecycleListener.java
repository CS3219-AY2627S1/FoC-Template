package com.friendoncampus.chat.messaging;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

/** A separate bean crosses the transactional proxy; offsets follow the projection commit. */
@Component
@ConditionalOnProperty(name="app.kafka.enabled",havingValue="true",matchIfMissing=true)
public class OrderLifecycleListener {
    private final OrderLifecycleConsumer projection;
    private final CaseEvidenceInbox inbox;
    public OrderLifecycleListener(OrderLifecycleConsumer projection,CaseEvidenceInbox inbox){this.projection=projection;this.inbox=inbox;}
    @KafkaListener(topics="order.lifecycle.events",groupId="chat-service-lifecycle")
    public void receive(org.apache.kafka.clients.consumer.ConsumerRecord<String,String> record,Acknowledgment ack){
        try{
            var e=tools.jackson.databind.json.JsonMapper.builder().build().readTree(record.value());
            if(!"order-service".equals(e.path("producer").asText())||!"Order".equals(e.path("aggregateType").asText())
                    ||!e.path("eventVersion").isIntegralNumber()||e.path("eventVersion").asInt()!=1
                    ||!e.path("aggregateId").asText().equals(record.key())||!e.path("data").path("orderId").asText().equals(record.key()))throw new IllegalArgumentException("Invalid Order lifecycle envelope/key");
            projection.process(record.value());
        }catch(RuntimeException ex){inbox.failed(record.topic(),record.partition(),record.offset(),record.value());throw ex;}
        ack.acknowledge();
    }
}
