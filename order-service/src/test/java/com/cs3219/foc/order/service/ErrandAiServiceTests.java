package com.cs3219.foc.order.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.cs3219.foc.order.config.ErrandAiProperties;
import com.cs3219.foc.order.exception.ErrandAiException;
import com.cs3219.foc.order.infrastructure.client.OpenAiGateway;
import com.cs3219.foc.order.infrastructure.client.SupplierClient;
import com.cs3219.foc.order.model.dto.*;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

class ErrandAiServiceTests {
    private final UUID cafe = UUID.randomUUID();
    private final SupplierClient suppliers = mock(SupplierClient.class);
    private final OpenAiGateway gateway = mock(OpenAiGateway.class);
    private ValidatorFactory validation;
    private ErrandAiService service;
    private final ErrandDraftDto initial = new ErrandDraftDto(null, "COM3", "Coffee", "", 5L, 60);

    @BeforeEach
    void setUp() {
        validation = Validation.buildDefaultValidatorFactory();
        service = new ErrandAiService(properties(true, "test-key"), suppliers, gateway, validation.getValidator());
        when(suppliers.listActive())
                .thenReturn(List.of(new SupplierPickupDto(cafe, "Campus Cafe", "COM1", "1", "Lobby", true)));
    }

    @AfterEach
    void close() {
        validation.close();
    }

    private ErrandAiProperties properties(boolean enabled, String key) {
        return new ErrandAiProperties(
                enabled, key, "test-model", "test-transcribe", Duration.ofSeconds(30), 8 * 1024 * 1024);
    }

    private AiChatRequest request(UUID selected) {
        return new AiChatRequest("Choose cafe", List.of(), initial, selected);
    }

    private ErrandAiModelResponse model(
            UUID supplier, String delivery, String description, String notes, long reward, int expiry) {
        return new ErrandAiModelResponse(
                "Review the draft with 5 credits and 1 hour.",
                new ErrandAiModelResponse.Draft(supplier, delivery, description, notes, reward, expiry),
                List.of(cafe, UUID.randomUUID()));
    }

    @Test
    void capabilitiesOnlyReadConfigurationAndRequireChatForVoice() {
        String[][] cases = {
            {"false", "key", "chat", "voice", "false", "false"},
            {"true", "", "chat", "voice", "false", "false"},
            {"true", "key", "", "voice", "false", "false"},
            {"true", "key", "chat", "", "true", "false"},
            {"true", "key", "chat", "voice", "true", "true"}
        };
        for (var item : cases) {
            var config = new ErrandAiProperties(
                    Boolean.parseBoolean(item[0]), item[1], item[2], item[3], Duration.ofSeconds(30), 8388608);
            var configured = new ErrandAiService(config, suppliers, gateway, validation.getValidator());
            assertThat(configured.capabilities())
                    .isEqualTo(
                            new AiCapabilitiesResponse(Boolean.parseBoolean(item[4]), Boolean.parseBoolean(item[5])));
        }
        verifyNoInteractions(suppliers, gateway);
    }

    @Test
    void selectionIsCanonicalizedAndContinuesThroughTheModel() {
        when(gateway.chat(any(), anyList())).thenReturn(model(cafe, "COM3", "Coffee", "", 5, 60));
        var response = service.chat(request(cafe));
        assertThat(response.draft().pickup().name()).isEqualTo("Campus Cafe");
        assertThat(response.draft().pickup().address()).isEqualTo("COM1 · 1 · Lobby");
        assertThat(response.missingFields()).isEmpty();
        assertThat(response.supplierChoices())
                .extracting(ErrandDraftDto.Pickup::id)
                .containsExactly(cafe);
        verify(gateway)
                .chat(
                        argThat(input -> input.selectedSupplierId().equals(cafe)
                                && input.draft().pickup().id().equals(cafe)),
                        anyList());
    }

    @Test
    void textClearsSurviveLaterTurnsAndRequiredClearsAreMissingNotInvalid() {
        when(gateway.chat(any(), anyList())).thenReturn(model(cafe, "", "", "", 5, 60));
        var first = service.chat(request(cafe));
        assertThat(first.missingFields()).containsExactly("deliveryLocation", "description");
        assertThat(first.draft().notes()).isEmpty();
        service.chat(new AiChatRequest(
                "Keep the reward", List.of(new AiChatRequest.Message("user", "Coffee to COM3")), first.draft(), null));
        verify(gateway)
                .chat(
                        argThat(input -> input.message().equals("Keep the reward")
                                && input.draft().deliveryLocation().isEmpty()
                                && input.draft().description().isEmpty()),
                        anyList());
    }

    @Test
    void forgedInactiveAndChangedSelectionsAreRejected() {
        assertThatThrownBy(() -> service.chat(request(UUID.randomUUID()))).isInstanceOf(ErrandAiException.class);
        verifyNoInteractions(gateway);
        when(gateway.chat(any(), anyList())).thenReturn(model(UUID.randomUUID(), "COM3", "Coffee", "", 5, 60));
        assertThatThrownBy(() -> service.chat(request(cafe))).isInstanceOf(ErrandAiException.class);
        when(suppliers.listActive()).thenReturn(List.of(new SupplierPickupDto(cafe, "Closed", "COM1", "1", "", false)));
        assertThatThrownBy(() -> service.chat(request(cafe))).isInstanceOf(ErrandAiException.class);
    }

    @Test
    void unsupportedRewardsExpiryAndOversizedContextAreRejected() {
        when(gateway.chat(any(), anyList())).thenReturn(model(cafe, "COM3", "Coffee", "", 0, 60));
        assertThatThrownBy(() -> service.chat(request(null)))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_INVALID_RESPONSE");
        when(gateway.chat(any(), anyList())).thenReturn(model(cafe, "COM3", "Coffee", "", 5, 45));
        assertThatThrownBy(() -> service.chat(request(null)))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_INVALID_RESPONSE");
        when(gateway.chat(any(), anyList())).thenReturn(model(cafe, "COM3", "Coffee", "", 5, 60));
        clearInvocations(suppliers, gateway);
        var history = Collections.nCopies(11, new AiChatRequest.Message("user", "x".repeat(2000)));
        assertThatThrownBy(() -> service.chat(new AiChatRequest("hello", history, initial, null)))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo("AI_INVALID_INPUT");
        verifyNoInteractions(suppliers, gateway);
    }

    @Test
    void disabledOrMissingKeyDoesNotCallUpstreams() {
        for (var properties : List.of(properties(false, "key"), properties(true, ""))) {
            var unavailable = new ErrandAiService(properties, suppliers, gateway, validation.getValidator());
            assertThatThrownBy(() -> unavailable.chat(request(null))).isInstanceOf(ErrandAiException.class);
        }
        verifyNoInteractions(suppliers, gateway);
    }

    @Test
    void transcriptionPreservesActualFormatAndHasNoChatSideEffects() {
        byte[] bytes = new byte[] {0x1a, 0x45, (byte) 0xdf, (byte) 0xa3, 1};
        when(gateway.transcribe(any(), eq("recording.webm"), eq("audio/webm"))).thenReturn(" 咖啡 to COM3 ");
        assertThat(service.transcribe(new MockMultipartFile("file", "untrusted.bin", "audio/webm;codecs=opus", bytes))
                        .text())
                .isEqualTo("咖啡 to COM3");
        verifyNoInteractions(suppliers);
        verify(gateway, never()).chat(any(), any());
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 4, 8388609})
    void emptyUnsupportedAndOversizedAudioNeverReachesOpenAi(int length) {
        byte[] bytes = new byte[length];
        if (length > 4) {
            bytes[0] = 0x1a;
            bytes[1] = 0x45;
            bytes[2] = (byte) 0xdf;
            bytes[3] = (byte) 0xa3;
        }
        String expectedCode =
                switch (length) {
                    case 0 -> "AI_EMPTY_AUDIO";
                    case 4 -> "AI_AUDIO_FORMAT";
                    default -> "AI_AUDIO_TOO_LARGE";
                };
        assertThatThrownBy(() -> service.transcribe(new MockMultipartFile("file", "a.webm", "audio/webm", bytes)))
                .isInstanceOf(ErrandAiException.class)
                .extracting("code")
                .isEqualTo(expectedCode);
        verifyNoInteractions(gateway);
    }
}
