package com.friendoncampus.chat.messaging;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.kafka.enabled",havingValue="true",matchIfMissing=true)
public class CaseEvidenceListener {
    private final CaseEvidenceInbox inbox;
    public CaseEvidenceListener(CaseEvidenceInbox inbox){this.inbox=inbox;}
    @KafkaListener(topics={"admin.events","credit.admin.events","user.admin.events"},groupId="chat-service-timeline")
    public void receive(ConsumerRecord<String,String> record,Acknowledgment ack){
        try{inbox.record(record.topic(),record.key(),record.value());} // Proxy commits before acknowledgement.
        catch(RuntimeException ex){inbox.failed(record.topic(),record.partition(),record.offset(),record.value());throw ex;}
        ack.acknowledge();
    }
}
