package sg.edu.nus.foc.credit.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import sg.edu.nus.foc.credit.credit.*;
import sg.edu.nus.foc.credit.security.InternalOrderSecurityConfiguration;

@WebMvcTest(controllers = InternalAutomaticRepostController.class,
        properties = {"FOC_INTERNAL_ORDER_API_ENABLED=true", "FOC_ENVIRONMENT=production"})
@Import(InternalOrderSecurityConfiguration.class)
class InternalAutomaticRepostControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean CreditCommandService commands;
    @MockitoBean CreditService credits;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean java.time.Clock clock;

    @org.junit.jupiter.api.BeforeEach
    void time() {
        when(clock.instant()).thenAnswer(call -> java.time.Instant.now());
    }

    @Test void keyedBackgroundReservationUsesTheNormalDurableCommandStore() throws Exception {
        CreditCommandResult result = new CreditCommandResult("K", CreditCommandOperation.RESERVE, "O",
                CreditCommandOutcome.APPLIED, "SUCCEEDED");
        when(commands.reserve("K", 1, "O", "U", 5)).thenReturn(new CommandMutationResult<>(null, result, false));
        mvc.perform(put("/api/credits/internal/automatic-reposts/O/reservation")
                .header("Idempotency-Key", "K").header("X-Command-Generation", "1")
                .contentType(MediaType.APPLICATION_JSON).content("{\"requesterId\":\"U\",\"amount\":5}"))
                .andExpect(status().isOk()).andExpect(header().string("Idempotency-Key", "K"))
                .andExpect(header().string("Command-Outcome", "APPLIED"));
        verify(commands).reserve("K", 1, "O", "U", 5);
        verifyNoInteractions(decoder);
    }

    @Test void missingHeadersAndInvalidAmountsNeverReserve() throws Exception {
        mvc.perform(put("/api/credits/internal/automatic-reposts/O/reservation")
                .contentType(MediaType.APPLICATION_JSON).content("{\"requesterId\":\"U\",\"amount\":5}"))
                .andExpect(status().isBadRequest());
        mvc.perform(put("/api/credits/internal/automatic-reposts/O/reservation")
                .header("Idempotency-Key", "K").header("X-Command-Generation", "1")
                .contentType(MediaType.APPLICATION_JSON).content("{\"requesterId\":\"U\",\"amount\":0}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(commands);
    }

    @Test void fundingBarrierWaitsForTheOriginalRefundWithoutMutatingCredit() throws Exception {
        when(credits.getReservation("O", "U")).thenReturn(new CreditReservation(
                "O", "U", null, 5, ReservationStatus.RESERVED, null, null, null, null));
        mvc.perform(get("/api/credits/internal/automatic-reposts/O/funding-ready").param("requesterId", "U"))
                .andExpect(status().isOk()).andExpect(content().string("false"));
        when(credits.getReservation("O", "U")).thenReturn(new CreditReservation(
                "O", "U", null, 5, ReservationStatus.REFUNDED, null, null, null, null));
        mvc.perform(get("/api/credits/internal/automatic-reposts/O/funding-ready").param("requesterId", "U"))
                .andExpect(status().isOk()).andExpect(content().string("true"));
        verifyNoInteractions(commands);
    }
}
