package com.friendoncampus.admin;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.SendResult;

class ActionKafkaTransportTest {
    final ActionDeliveryStore store=mock(ActionDeliveryStore.class);
    final CreditActionService actions=mock(CreditActionService.class);
    @SuppressWarnings("unchecked") final KafkaTemplate<String,String> kafka=mock(KafkaTemplate.class);
    final ActionKafkaTransport transport=new ActionKafkaTransport(store,actions,kafka,60);
    @Test void brokerFailureRetainsTheOriginalDeliveryForRetryWithoutConfirmation(){
        var delivery=new ActionDeliveryStore.Delivery(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),"test-only-original-command");
        when(store.claim()).thenReturn(List.of(delivery));when(kafka.send("admin.credit.commands",delivery.target().toString(),delivery.payload())).thenReturn(CompletableFuture.failedFuture(new IllegalStateException("Broker down")));
        transport.publish();verify(store).failed(delivery);verify(store,never()).confirmed(any(),anyLong());verifyNoInteractions(actions);
    }
    @Test void storageFailureCannotAcknowledgeAnOutcome(){
        var acknowledgment=mock(Acknowledgment.class);when(actions.outcome("key","test-only")).thenThrow(new DataAccessResourceFailureException("Database down"));
        assertThrows(DataAccessResourceFailureException.class,()->transport.receive(new ConsumerRecord<>("credit.admin.events",0,1,"key","test-only"),acknowledgment));verifyNoInteractions(acknowledgment);
    }
    @Test void invalidOutcomeDltContainsMetadataAndNoReasonBodyAndMustBeConfirmedBeforeAck(){
        var acknowledgment=mock(Acknowledgment.class);String raw="test-only-private-reason";
        when(actions.outcome("key",raw)).thenReturn(false);
        when(kafka.send(eq("credit.admin.events.DLT"),eq("key"),anyString())).thenReturn(CompletableFuture.completedFuture(null));
        transport.receive(new ConsumerRecord<>("credit.admin.events",0,7,"key",raw),acknowledgment);
        var payload=ArgumentCaptor.forClass(String.class);verify(kafka).send(eq("credit.admin.events.DLT"),eq("key"),payload.capture());assertFalse(payload.getValue().contains(raw));assertTrue(payload.getValue().contains("\"offset\":7"));verify(acknowledgment).acknowledge();
        reset(acknowledgment);when(kafka.send(eq("credit.admin.events.DLT"),eq("key"),anyString())).thenReturn(CompletableFuture.failedFuture(new IllegalStateException()));
        assertThrows(IllegalStateException.class,()->transport.receive(new ConsumerRecord<>("credit.admin.events",0,7,"key",raw),acknowledgment));verifyNoInteractions(acknowledgment);
    }
}
