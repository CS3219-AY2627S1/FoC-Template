package sg.edu.nus.foc.order.application;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import com.google.api.core.ApiFutures;
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.PubsubMessage;
import java.time.Duration;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import sg.edu.nus.foc.order.adapter.PubSubReportCompensationPublisher;
import sg.edu.nus.foc.order.api.ReportCompensationResultController;
import sg.edu.nus.foc.order.application.reportresolution.*;
import sg.edu.nus.foc.order.config.*;
import sg.edu.nus.foc.order.domain.OrderProblem;
import sg.edu.nus.foc.order.messagingpublisher.publisher.EventPublicationException;
import sg.edu.nus.foc.order.messagingpublisher.publisher.PubSubPublisherFactory;
import tools.jackson.databind.json.JsonMapper;

class ReportResolutionContractTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private ReportResolutionSettings settings(String url, Duration timeout, String result) {
        return new ReportResolutionSettings(url, timeout, "report-requests", result, "report-results", "emulator", "", "", "demo-test", "emulator", "localhost:8085", "local", "demo-auth", "localhost:9099");
    }
    @Test void unsafeOrIncompleteSettingsFailInsteadOfFallingBack() {
        assertNotNull(settings("http://localhost:8086", Duration.ofSeconds(1), "result-topic"));
        for (String url : List.of("", "ftp://localhost/a", "http://user:pass@localhost", "http://localhost?q=x", "http://localhost#fragment", "https:/missing-host"))
            assertThrows(IllegalArgumentException.class, () -> settings(url, Duration.ofSeconds(1), "result-topic"));
        for (Duration timeout : List.of(Duration.ZERO, Duration.ofSeconds(-1), Duration.ofSeconds(61)))
            assertThrows(IllegalArgumentException.class, () -> settings("http://localhost", timeout, "result-topic"));
        for (String topic : List.of("", "projects/project/topics/topic", "report-requests"))
            assertThrows(IllegalArgumentException.class, () -> settings("http://localhost", Duration.ofSeconds(1), topic));
        assertThrows(IllegalArgumentException.class, () -> new ReportResolutionSettings("http://localhost", Duration.ofSeconds(1), "requests", "results", "sub", "google", "https://order", "push@p.iam.gserviceaccount.com", "cloud-project", "cloud", "", "production", "auth-project", ""));
        assertThrows(IllegalArgumentException.class, () -> new ReportResolutionSettings("https://reports.example", Duration.ofSeconds(1), "requests", "results", "sub", "emulator", "", "", "demo-project", "emulator", "broker:8085", "staging", "demo-auth", "auth:9099"));
    }
    @Test void exactMinimalRequestIsPublishedWithStableAttributesAndPublicationFailuresRemainVisible() throws Exception {
        var factory = mock(PubSubPublisherFactory.class); var broker = mock(Publisher.class);
        when(factory.forTopic("demo-test", "report-requests")).thenReturn(broker);
        when(broker.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFuture("broker-id"));
        var publisher = new PubSubReportCompensationPublisher(factory, json, settings("http://localhost",Duration.ofSeconds(1),"result-topic"));
        var event = new ReportResolutionMessages.Compensation(UUID.randomUUID().toString(),"command","report","order","requester",null,"admin",2);
        publisher.publish(event);
        var sent = ArgumentCaptor.forClass(PubsubMessage.class); verify(broker).publish(sent.capture());
        assertEquals(Map.of("eventId",event.eventId(),"eventType","ReportResolutionCompensationRequested","eventVersion","1"),sent.getValue().getAttributesMap());
        assertEquals(event,json.readValue(sent.getValue().getData().toStringUtf8(),ReportResolutionMessages.Compensation.class));
        assertEquals(8,json.readTree(sent.getValue().getData().toStringUtf8()).size());
        when(broker.publish(any(PubsubMessage.class))).thenReturn(ApiFutures.immediateFailedFuture(new IllegalStateException("unavailable")));
        assertThrows(EventPublicationException.class, () -> publisher.publish(event));
        try {
            com.google.api.core.ApiFuture<String> interrupted = mock(com.google.api.core.ApiFuture.class);
            when(interrupted.get(anyLong(), any(java.util.concurrent.TimeUnit.class))).thenThrow(new InterruptedException("interrupted"));
            when(broker.publish(any(PubsubMessage.class))).thenReturn(interrupted);
            assertThrows(EventPublicationException.class, () -> publisher.publish(event));
            assertTrue(Thread.currentThread().isInterrupted());
        } finally { Thread.interrupted(); }
    }
    private ReportResolutionMessages.Result result() {
        return new ReportResolutionMessages.Result(UUID.randomUUID().toString(),UUID.randomUUID().toString(),"command","report","order","requester","courier","admin",2,"COMPENSATED","REVERSED");
    }
    private ReportCompensationResultController.Envelope envelope(ReportResolutionMessages.Result result) {
        return new ReportCompensationResultController.Envelope("projects/demo-test/subscriptions/report-results",
                new ReportCompensationResultController.Message(Base64.getEncoder().encodeToString(json.writeValueAsBytes(result)),
                        Map.of("eventType","ReportResolutionCompensationResult","eventVersion","1","eventId",result.eventId())));
    }
    @Test void receiverRequiresExactEnvelopeBeforeCommittingAndNeverAcknowledgesPersistenceFailure() {
        var journal = mock(ReportResolutionJournal.class);
        var receiver = new ReportCompensationResultController(journal,json,settings("http://localhost",Duration.ofSeconds(1),"result-topic"));
        var result = result(); var valid = envelope(result);
        assertEquals(204,receiver.receive(valid).getStatusCode().value()); verify(journal).accept(result); clearInvocations(journal);
        for (var bad : List.of(new ReportCompensationResultController.Envelope("wrong",valid.message()),
                new ReportCompensationResultController.Envelope(valid.subscription(),null),
                new ReportCompensationResultController.Envelope(valid.subscription(),new ReportCompensationResultController.Message("%%%",valid.message().attributes())),
                new ReportCompensationResultController.Envelope(valid.subscription(),new ReportCompensationResultController.Message(valid.message().data(),Map.of())),
                new ReportCompensationResultController.Envelope(valid.subscription(),new ReportCompensationResultController.Message(valid.message().data(),Map.of("eventType","ReportResolutionCompensationResult","eventVersion","1","eventId","wrong")))))
            assertThrows(OrderProblem.class,()->receiver.receive(bad));
        assertThrows(OrderProblem.class,()->receiver.receive(null)); verifyNoInteractions(journal);
        doThrow(new IllegalStateException("commit failed")).when(journal).accept(result);
        assertThrows(IllegalStateException.class,()->receiver.receive(valid));
    }
    @Test void recoverySkipsOneFailedCommandAndContinuesOtherIndependentJobs() {
        var journal = mock(ReportResolutionJournal.class);
        when(journal.due(20)).thenReturn(List.of("failed","success"));
        doThrow(new IllegalStateException("busy")).when(journal).recover("failed");
        new ReportResolutionService(journal,mock(ReportResolutionGateway.class)).recoverDue();
        verify(journal).recover("success");
    }
}
