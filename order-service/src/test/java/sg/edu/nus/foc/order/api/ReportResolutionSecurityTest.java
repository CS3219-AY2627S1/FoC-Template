package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.api.dto.response.ReportResolutionResponse;
import sg.edu.nus.foc.order.application.reportresolution.*;
import sg.edu.nus.foc.order.config.*;
import sg.edu.nus.foc.order.security.Role;
import sg.edu.nus.foc.order.security.RoleProvider;

@WebMvcTest(controllers={AdminReportResolutionController.class,ReportCompensationResultController.class},properties={
    "order.reports.resolution.enabled=true","order.reports.resolution.base-url=https://reports.example",
    "order.reports.resolution.compensation-topic=requests","order.reports.resolution.result-topic=results",
    "order.reports.resolution.result-subscription=order-report-results","order.reports.resolution.push-mode=google",
    "order.reports.resolution.audience=https://order.example","order.reports.resolution.service-account=report-push@project.iam.gserviceaccount.com",
    "order.messaging.project-id=cloud-project","order.messaging.mode=cloud","order.messaging.emulator-host=",
    "order.security.auth.emulator-host=","FOC_ENVIRONMENT=staging"})
@ActiveProfiles("prod")
@Import({SecurityConfiguration.class,ProductionMethodSecurityConfiguration.class,ReportCompensationPushSecurityConfiguration.class,ReportResolutionSettings.class})
class ReportResolutionSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean ReportResolutionService service;
    @MockitoBean ReportResolutionJournal journal;
    @MockitoBean RoleProvider roles;
    @MockitoBean(name="jwtDecoder") JwtDecoder users;
    @MockitoBean(name="reportResolutionPushJwtDecoder") JwtDecoder broker;
    private static final String PATH="/api/orders/admin/order/reports/report/resolve";
    @Test void onlyVerifiedAdminsCanStartOrReadResolutions() throws Exception {
        String body="{\"commandId\":\"key\",\"reply\":\"Evidence reviewed\"}";
        mvc.perform(post(PATH).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mvc.perform(post(PATH).with(user("u").roles("REQUESTER")).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        Jwt token=Jwt.withTokenValue("admin-token").header("alg","RS256").subject("admin").build();
        when(users.decode("admin-token")).thenReturn(token);when(roles.rolesFor(token)).thenReturn(Set.of(Role.ADMIN));
        when(service.resolve("key","order","report","admin","Evidence reviewed","Bearer admin-token"))
                .thenReturn(new ReportResolutionResponse("key","order","report","COMPENSATING","COMPENSATING",null));
        mvc.perform(post(PATH).header("Authorization","Bearer admin-token").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("COMPENSATING"));
        verify(service).resolve("key","order","report","admin","Evidence reviewed","Bearer admin-token");
        when(service.status("key")).thenReturn(new ReportResolutionResponse("key","order","report","SUCCEEDED","RESOLVED",null));
        mvc.perform(get("/api/orders/admin/report-resolutions/key").header("Authorization","Bearer admin-token")).andExpect(status().isOk());
        mvc.perform(post(PATH).header("Authorization","Bearer admin-token").contentType(MediaType.APPLICATION_JSON).content("{\"commandId\":\"key\",\"reply\":\" \"}"))
                .andExpect(status().isBadRequest());
    }
    @Test void brokerReceiverDoesNotAcceptAnonymousOrFirebaseUserIdentity() throws Exception {
        mvc.perform(post(ReportCompensationResultController.PATH).contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isUnauthorized());
        when(broker.decode("firebase")).thenThrow(new BadJwtException("Wrong issuer"));
        mvc.perform(post(ReportCompensationResultController.PATH).header("Authorization","Bearer firebase").contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isUnauthorized());
        verifyNoInteractions(journal);
        when(broker.decode("push")).thenReturn(Jwt.withTokenValue("push").header("alg","RS256").subject("report-push").build());
        mvc.perform(post(ReportCompensationResultController.PATH).header("Authorization","Bearer push").contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isNoContent());
        verify(journal).accept(any());
    }
    private String envelope(){
        String body="{\"eventId\":\"11111111-1111-4111-8111-111111111111\",\"compensationId\":\"22222222-2222-4222-8222-222222222222\",\"commandId\":\"key\",\"reportId\":\"report\",\"orderId\":\"order\",\"requesterId\":\"owner\",\"courierId\":\"courier\",\"adminId\":\"admin\",\"generation\":2,\"outcome\":\"COMPENSATED\",\"code\":\"REVERSED\"}";
        return "{\"subscription\":\"projects/cloud-project/subscriptions/order-report-results\",\"message\":{\"data\":\""+Base64.getEncoder().encodeToString(body.getBytes(StandardCharsets.UTF_8))+"\",\"attributes\":{\"eventId\":\"11111111-1111-4111-8111-111111111111\",\"eventType\":\"ReportResolutionCompensationResult\",\"eventVersion\":\"1\"}}}";
    }
}
