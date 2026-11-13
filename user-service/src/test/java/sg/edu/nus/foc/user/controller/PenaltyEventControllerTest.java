/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-11-05
 * Mode: Code generation.
 * Scope: Generated the initial test code based on the architecture of PenaltyEventControllerTest.java.
 * Author review: I reviewed for correctness.
 */
package sg.edu.nus.foc.user.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.ResponseEntity;

import sg.edu.nus.foc.user.dto.PubSubPushRequest;
import sg.edu.nus.foc.user.event.PenaltyEventConsumer;

@ExtendWith(MockitoExtension.class)
class PenaltyEventControllerTest {

    @Mock
    private PenaltyEventConsumer penaltyEventConsumer;

    @InjectMocks
    private PenaltyEventController penaltyEventController;

    private PubSubPushRequest request;

    @BeforeEach
    void setUp() {
        request = mock(PubSubPushRequest.class);
    }

    // --------------------------------------------------
    // Addition endpoint
    // --------------------------------------------------

    @Test
    void receiveAdditionReturnsOk() {
        ResponseEntity<Void> response =
                penaltyEventController.receiveAddition(request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNull();

        verify(penaltyEventConsumer).consumeAddition(request);
        verifyNoMoreInteractions(penaltyEventConsumer);
    }

    @Test
    void receiveAdditionPropagatesConsumerException() {
        RuntimeException exception =
                new RuntimeException("Failed to process penalty addition");

        doThrow(exception)
                .when(penaltyEventConsumer)
                .consumeAddition(request);

        RuntimeException thrown = assertThrows(
                RuntimeException.class,
                () -> penaltyEventController.receiveAddition(request));

        assertThat(thrown).isSameAs(exception);

        verify(penaltyEventConsumer).consumeAddition(request);
    }

    // --------------------------------------------------
    // Deduction endpoint
    // --------------------------------------------------

    @Test
    void receiveDeductionReturnsOk() {
        ResponseEntity<Void> response =
                penaltyEventController.receiveDeduction(request);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isNull();

        verify(penaltyEventConsumer).consumeDeduction(request);
        verifyNoMoreInteractions(penaltyEventConsumer);
    }

    @Test
    void receiveDeductionPropagatesConsumerException() {
        RuntimeException exception =
                new RuntimeException("Failed to process penalty deduction");

        doThrow(exception)
                .when(penaltyEventConsumer)
                .consumeDeduction(request);

        RuntimeException thrown = assertThrows(
                RuntimeException.class,
                () -> penaltyEventController.receiveDeduction(request));

        assertThat(thrown).isSameAs(exception);

        verify(penaltyEventConsumer).consumeDeduction(request);
    }
}
