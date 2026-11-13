package com.friendoncampus.admin;

import java.util.concurrent.TimeUnit;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="app.kafka.enabled",havingValue="true")
public class ActionKafkaTransport {
    private static final Logger log=LoggerFactory.getLogger(ActionKafkaTransport.class);
    private final ActionDeliveryStore outbox;private final CreditActionService actions;private final KafkaTemplate<String,String> kafka;private final long reconcileSeconds;
    public ActionKafkaTransport(ActionDeliveryStore outbox,CreditActionService actions,KafkaTemplate<String,String> kafka,@Value("${app.kafka.reconcile-seconds:60}") long reconcileSeconds){
        if(reconcileSeconds<10)throw new IllegalArgumentException("Reconciliation interval must be at least 10 seconds");this.outbox=outbox;this.actions=actions;this.kafka=kafka;this.reconcileSeconds=reconcileSeconds;
    }
    @Scheduled(fixedDelayString="${app.kafka.outbox-delay:2000}")
    public void publish(){
        for(var d:outbox.claim()){
            try{kafka.send(d.topic(),d.target().toString(),d.payload()).get(10,TimeUnit.SECONDS);outbox.confirmed(d,reconcileSeconds);log.info("Admin case command broker-confirmed operationId={} eventId={}",d.operationId(),d.eventId());}
            catch(InterruptedException ex){Thread.currentThread().interrupt();outbox.failed(d);return;}
            catch(Exception ex){outbox.failed(d);log.warn("Admin case command unconfirmed operationId={} eventId={}",d.operationId(),d.eventId());}
        }
    }
    @KafkaListener(topics="credit.admin.events",groupId="admin-service-credit")
    public void receive(ConsumerRecord<String,String> record,Acknowledgment acknowledgment){handle(record,acknowledgment,false);}
    @KafkaListener(topics="user.admin.events",groupId="admin-service-user")
    public void receiveUser(ConsumerRecord<String,String> record,Acknowledgment acknowledgment){handle(record,acknowledgment,true);}
    private void handle(ConsumerRecord<String,String> record,Acknowledgment acknowledgment,boolean user){
        boolean accepted=user?actions.outcome(record.key(),record.value(),"user-service"):actions.outcome(record.key(),record.value());
        if(!accepted){
            try {kafka.send(record.topic()+".DLT",record.key(),"{\"failureCode\":\"INVALID_OR_CONFLICTING_OUTCOME\",\"sourceTopic\":\""+record.topic()+"\",\"partition\":"+record.partition()+",\"offset\":"+record.offset()+",\"contentHash\":\""+CreditActionService.hash(String.valueOf(record.value()))+"\"}").get(10,TimeUnit.SECONDS);}
            catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException("DLT delivery unconfirmed");}
            catch(Exception e){throw new IllegalStateException("DLT delivery unconfirmed");}
        }
        acknowledgment.acknowledge();
        log.info("Admin credit outcome handled partition={} offset={}",record.partition(),record.offset());
    }
}
