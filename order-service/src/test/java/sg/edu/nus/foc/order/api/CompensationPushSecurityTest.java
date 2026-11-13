package sg.edu.nus.foc.order.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.order.application.recovery.OrderCompensationJournal;
import sg.edu.nus.foc.order.config.CompensationPushSecurityConfiguration;
import sg.edu.nus.foc.order.config.CompensationTransportSettings;

@WebMvcTest(controllers = CreditCompensationResultController.class, properties = {
    "order.commands.compensation.enabled=true",
    "order.commands.compensation.request-topic=requests",
    "order.commands.compensation.result-subscription=results",
    "order.commands.compensation.push-mode=google",
    "order.commands.compensation.audience=https://order.example",
    "order.commands.compensation.service-account=push@project.iam.gserviceaccount.com",
    "order.messaging.project-id=cloud-project", "order.messaging.mode=cloud",
    "order.messaging.emulator-host=", "order.security.auth.emulator-host=", "FOC_ENVIRONMENT=staging"
})
@Import({CompensationPushSecurityConfiguration.class, CompensationTransportSettings.class})
class CompensationPushSecurityTest {
    @Autowired MockMvc mvc;
    @MockitoBean OrderCompensationJournal journal;
    @MockitoBean(name = "compensationResultJwtDecoder") JwtDecoder decoder;

    @Test void unsignedAndUserTokensCannotEnterBrokerReceiver() throws Exception {
        mvc.perform(post(CreditCompensationResultController.PATH)
                .contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isUnauthorized());
        when(decoder.decode("firebase-user")).thenThrow(new BadJwtException("Not a Google broker token"));
        mvc.perform(post(CreditCompensationResultController.PATH).header("Authorization", "Bearer firebase-user")
                .contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isUnauthorized());
        verifyNoInteractions(journal);
    }
    @Test void authenticatedBrokerResultCommitsAndMalformedEnvelopeDoesNot() throws Exception {
        when(decoder.decode("broker")).thenReturn(Jwt.withTokenValue("broker").header("alg", "RS256")
                .subject("push-service").build());
        mvc.perform(post(CreditCompensationResultController.PATH).header("Authorization", "Bearer broker")
                .contentType(MediaType.APPLICATION_JSON).content(envelope())).andExpect(status().isNoContent());
        verify(journal).accept(any());
        clearInvocations(journal);
        mvc.perform(post(CreditCompensationResultController.PATH).header("Authorization", "Bearer broker")
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isBadRequest());
        verifyNoInteractions(journal);
    }
    private static String envelope() {
        String result = """
            {"eventId":"11111111-1111-4111-8111-111111111111",
             "compensationId":"22222222-2222-4222-8222-222222222222",
             "commandId":"K","orderId":"O","operation":"RESERVE","generation":2,
             "outcome":"COMPENSATED","code":"REVERSED"}
            """;
        return "{\"subscription\":\"projects/cloud-project/subscriptions/results\",\"message\":{\"data\":\""
                + Base64.getEncoder().encodeToString(result.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                + "\",\"attributes\":{\"eventType\":\"CreditCompensationResult\",\"eventVersion\":\"1\"}}}";
    }
}
