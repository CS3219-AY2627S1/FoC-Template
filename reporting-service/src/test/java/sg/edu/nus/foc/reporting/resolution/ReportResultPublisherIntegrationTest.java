/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Actual Pub/Sub wire contract verification. */
package sg.edu.nus.foc.reporting.resolution;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.testcontainers.gcloud.PubSubEmulatorContainer;
import org.testcontainers.utility.DockerImageName;
import sg.edu.nus.foc.reporting.report.ReportResolutionStore;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.Result;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReportResultPublisherIntegrationTest {
    @Test void publishesExactStableResultWithBusinessAttributesToRealEmulator() throws Exception {
        try(var emulator=new PubSubEmulatorContainer(DockerImageName.parse("gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators"))) {
            emulator.start();
            String endpoint=emulator.getEmulatorEndpoint();
            var http=RestClient.builder().baseUrl("http://"+endpoint+"/v1/projects/demo-foc").build();
            http.put().uri("/topics/results").body(Map.of()).retrieve().toBodilessEntity();
            http.put().uri("/subscriptions/observe").body(Map.of("topic","projects/demo-foc/topics/results")).retrieve().toBodilessEntity();
            var settings=new ResolutionSettings(true,"demo-foc","results","sub","","",endpoint,true);
            var json=JsonMapper.builder().build();
            var result=new Result(UUID.randomUUID().toString(),UUID.randomUUID().toString(),"command","report","order","requester",null,"admin",2,"COMPENSATED","REVERSED");
            var publisher=new ReportResultDispatcher(mock(ReportResolutionStore.class),settings,json);
            publisher.publish(result,json.writeValueAsString(result));
            var pulled=json.valueToTree(http.post().uri("/subscriptions/observe:pull").body(Map.of("maxMessages",1)).retrieve().body(Object.class));
            var message=pulled.path("receivedMessages").get(0).path("message");
            assertEquals(result.eventId(),message.path("attributes").path("eventId").asString());
            assertEquals("ReportResolutionCompensationResult",message.path("attributes").path("eventType").asString());
            assertEquals("1",message.path("attributes").path("eventVersion").asString());
            var actual=json.readValue(Base64.getDecoder().decode(message.path("data").asString()),Result.class);
            assertEquals(result,actual);
            var disabled=new ReportResultDispatcher(mock(ReportResolutionStore.class),new ResolutionSettings(false,"p","","","","","",false),json);
            assertDoesNotThrow(disabled::recover);
            assertDoesNotThrow(()->disabled.dispatch("anything"));
        }
    }
}
