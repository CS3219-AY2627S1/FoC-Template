/* AI Assistance Disclosure: OpenAI Codex, 2026-10-29. Resolution HTTP auth, strict event contracts and publication failure regression tests. */
package sg.edu.nus.foc.reporting.resolution;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.reporting.report.ReportResolutionStore;
import sg.edu.nus.foc.reporting.resolution.ResolutionMessages.*;
import tools.jackson.databind.json.JsonMapper;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"REPORT_RESOLUTION_ENABLED=true","REPORT_PUBSUB_PROJECT_ID=demo-foc",
        "REPORT_RESOLUTION_RESULT_TOPIC=result","REPORT_RESOLUTION_COMPENSATION_SUBSCRIPTION=projects/demo-foc/subscriptions/report-comp",
        "REPORT_RESOLUTION_PUSH_MODE=emulator","PUBSUB_EMULATOR_HOST=localhost:9999","FIREBASE_AUTH_EMULATOR_HOST=localhost:9099",
        "foc.reporting.firestore.emulator-host=localhost:9998","foc.reporting.storage.emulator-host=http://localhost:9997",
        "foc.reporting.user-service.mock-admin-emails=admin@example.com","REPORT_RESULT_RECOVERY_CRON=-","REPORT_RESPONSE_RECOVERY_CRON=-"})
@AutoConfigureMockMvc
class ReportResolutionApiTest {
    @Autowired MockMvc mvc;
    @Autowired JsonMapper json;
    @MockitoBean ReportResolutionStore store;
    @MockitoBean ReportResultDispatcher dispatcher;
    final String path="/api/reports/internal/order-resolutions/key";
    final Command c=new Command("key","report","order","requester","courier","admin",1,"Evidence reviewed");
    @Test void adminAuthenticationBindingAndValidationAreRequired() throws Exception {
        when(store.resolve(c)).thenReturn(new Resolution("key","report","order","requester","courier","admin",1,"APPLIED","RESOLVED"));
        mvc.perform(put(path).contentType("application/json").content(json.writeValueAsString(c))).andExpect(status().isUnauthorized());
        mvc.perform(put(path).with(jwt().jwt(j->j.subject("admin"))).contentType("application/json").content(json.writeValueAsString(c))).andExpect(status().isForbidden());
        mvc.perform(put(path).with(jwt().jwt(j->j.subject("other").claim("email","admin@example.com"))).contentType("application/json").content(json.writeValueAsString(c))).andExpect(status().isForbidden());
        mvc.perform(put(path).with(jwt().jwt(j->j.subject("admin").claim("email","admin@example.com"))).contentType("application/json").content(json.writeValueAsString(c))).andExpect(status().isOk()).andExpect(jsonPath("$.outcome").value("APPLIED"));
        mvc.perform(put(path.replace("key","different")).with(jwt().jwt(j->j.subject("admin").claim("email","admin@example.com"))).contentType("application/json").content(json.writeValueAsString(c))).andExpect(status().isBadRequest());
        mvc.perform(put(path).with(jwt().jwt(j->j.subject("admin").claim("email","admin@example.com"))).contentType("application/json").content(json.writeValueAsString(c).replace("Evidence reviewed"," "))).andExpect(status().isBadRequest());
    }
    @Test void pushValidatesSubscriptionSchemaGenerationAndBusinessEventId() throws Exception {
        var request=new Compensation(UUID.randomUUID().toString(),"key","report","order","requester","courier","admin",2);
        String valid=envelope(json.writeValueAsString(request),request.eventId());
        mvc.perform(post(ReportResolutionController.PUSH).contentType("application/json").content(valid)).andExpect(status().isNoContent());
        verify(store).compensate(request); verify(dispatcher).dispatch(request.eventId());
        mvc.perform(post(ReportResolutionController.PUSH).contentType("application/json").content(valid.replace("report-comp","wrong"))).andExpect(status().isBadRequest());
        mvc.perform(post(ReportResolutionController.PUSH).contentType("application/json").content(envelope("{}",request.eventId()))).andExpect(status().isBadRequest());
        mvc.perform(post(ReportResolutionController.PUSH).contentType("application/json").content(envelope(json.writeValueAsString(request).replace("\"generation\":2","\"generation\":1"),request.eventId()))).andExpect(status().isBadRequest());
        mvc.perform(post(ReportResolutionController.PUSH).contentType("application/json").content(envelope(json.writeValueAsString(request),"different"))).andExpect(status().isBadRequest());
    }
    @Test void enabledOperationsAppearInOpenApi() throws Exception {
        mvc.perform(get("/api/reports/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.paths['/api/reports/internal/order-resolutions/{commandId}'].put.summary").isNotEmpty())
                .andExpect(jsonPath("$.paths['/api/reports/internal/order-resolution-compensations'].post.responses['204']").exists());
    }
    String envelope(String payload,String id) {
        return json.writeValueAsString(Map.of("subscription","projects/demo-foc/subscriptions/report-comp","message",Map.of(
                "data",Base64.getEncoder().encodeToString(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                "attributes",Map.of("eventId",id,"eventType","ReportResolutionCompensationRequested","eventVersion","1"))));
    }
    @Test void settingsRejectUnsafeCloudAndEmulatorActivation() {
        assertThrows(IllegalStateException.class,()->new ResolutionSettings(true,"real","t","s","","","localhost:1","emulator","production","localhost:2","demo-foc"));
        assertThrows(IllegalStateException.class,()->new ResolutionSettings(true,"real","t","s","","","","google","production","","real-auth"));
        assertThrows(IllegalStateException.class,()->new ResolutionSettings(true,"demo-foc","","s","","","host","emulator","local","auth","demo-foc"));
        assertThrows(IllegalStateException.class,()->new ResolutionSettings(true,"demo-foc","t","s","","","host","emulator","local","auth","real-auth"));
        assertThrows(IllegalStateException.class,()->new ResolutionSettings(true,"real","t","s","https://aud","push@p.iam.gserviceaccount.com","","google","production","auth","real-auth"));
        assertDoesNotThrow(()->new ResolutionSettings(true,"real","t","s","https://aud","push@p.iam.gserviceaccount.com","","google","production","","real-auth"));
    }
    @Test void dispatcherRetainsFailedWorkAndContinuesOtherResults() throws Exception {
        var settings=new ResolutionSettings(true,"demo-foc","t","s","","","host",true);
        var store=mock(ReportResolutionStore.class);
        var good=new Result("id","comp","key","r","o","u",null,"a",2,"COMPENSATED","REVERSED");
        var first=new ReportResolutionStore.Claim("bad","owner","bad json",1);
        var second=new ReportResolutionStore.Claim("good","owner",json.writeValueAsString(good),1);
        when(store.due()).thenReturn(List.of("bad","good"));
        when(store.claim("bad")).thenReturn(Optional.of(first)); when(store.claim("good")).thenReturn(Optional.of(second));
        var dispatcher=new ReportResultDispatcher(store,settings,json) { @Override protected void publish(Result r,String p) { } };
        dispatcher.recover(); verify(store).finish(first,false); verify(store).finish(second,true);
    }
}
