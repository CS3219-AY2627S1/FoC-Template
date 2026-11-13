package com.cs3219.foc.order.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.order.config.SecurityConfig;
import com.cs3219.foc.order.exception.ErrandAiException;
import com.cs3219.foc.order.exception.GlobalExceptionHandler;
import com.cs3219.foc.order.model.dto.AiCapabilitiesResponse;
import com.cs3219.foc.order.model.dto.TranscriptionResponse;
import com.cs3219.foc.order.service.ErrandAiService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@SpringJUnitWebConfig(ErrandAiControllerTests.Config.class)
class ErrandAiControllerTests {
    @Autowired
    WebApplicationContext context;

    @Autowired
    ErrandAiService service;

    MockMvc mvc;

    @BeforeEach
    void setUp() {
        reset(service);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    private String body(String role, String message) {
        return """
                {"message":"%s","history":[{"role":"%s","content":"Hello"}],
                 "draft":{"pickup":null,"deliveryLocation":null,"description":null,"notes":"","creditReward":5,"expiryMinutes":60}}
                """.formatted(message, role);
    }

    @Test
    void capabilitiesRequireAuthenticationAndReturnFlags() throws Exception {
        mvc.perform(get("/orders/ai/capabilities")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
        when(service.capabilities()).thenReturn(new AiCapabilitiesResponse(true, false));
        mvc.perform(get("/orders/ai/capabilities").with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.chatEnabled").value(true))
                .andExpect(jsonPath("$.voiceEnabled").value(false))
                .andExpect(jsonPath("$.apiKey").doesNotExist());
    }

    @Test
    void requiresAuthenticationAndRejectsInjectedRolesAndLongMessages() throws Exception {
        mvc.perform(post("/orders/ai/chat")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("user", "Hi")))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/orders/ai/chat")
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("system", "Hi")))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/orders/ai/chat")
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("user", "x".repeat(2001))))
                .andExpect(status().isBadRequest());
        mvc.perform(multipart("/orders/ai/transcriptions").file(new MockMultipartFile("file", new byte[] {1})))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void unavailableIsAnExplicitErrorAndAudioUsesItsOwnEndpoint() throws Exception {
        when(service.chat(any())).thenThrow(ErrandAiException.unavailable());
        mvc.perform(post("/orders/ai/chat")
                        .with(jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("user", "Hi")))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("AI_UNAVAILABLE"));
        when(service.transcribe(any())).thenReturn(new TranscriptionResponse("Coffee please"));
        mvc.perform(multipart("/orders/ai/transcriptions")
                        .file(new MockMultipartFile("file", "audio.webm", "audio/webm", new byte[] {1}))
                        .with(jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.text").value("Coffee please"));
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({ErrandAiController.class, SecurityConfig.class, GlobalExceptionHandler.class})
    static class Config {
        @Bean
        ErrandAiService service() {
            return mock(ErrandAiService.class);
        }

        @Bean
        JwtDecoder decoder() {
            return mock(JwtDecoder.class);
        }
    }
}
