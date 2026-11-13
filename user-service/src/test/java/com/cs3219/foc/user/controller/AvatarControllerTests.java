package com.cs3219.foc.user.controller;

import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.user.exception.AvatarException;
import com.cs3219.foc.user.exception.StorageException;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.service.AvatarService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@SpringJUnitWebConfig(UserControllerTests.TestConfig.class)
class AvatarControllerTests {
    @Autowired
    private WebApplicationContext context;

    @Autowired
    private AvatarService avatarService;

    @Autowired
    private JwtDecoder decoder;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final MockMultipartFile file = new MockMultipartFile("file", new byte[] {1});

    @BeforeEach
    void setUp() {
        reset(avatarService, decoder);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
    }

    @Test
    void uploadUsesJwtIdentityAndReturnsProfile() throws Exception {
        var profile = new UserProfileDto(
                userId.toString(),
                "alex@example.com",
                "Alex",
                List.of("USER"),
                null,
                null,
                "/api/users/" + userId + "/avatar?v=test.png");
        when(avatarService.uploadAvatar(any())).thenReturn(profile);
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar")
                        .file(file)
                        .param("userId", UUID.randomUUID().toString())
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(profile.avatarUrl()))
                .andExpect(jsonPath("$.avatarKey").doesNotExist());
        verify(avatarService).uploadAvatar(any());
    }

    @Test
    void publicImageEndpointIsNotAvailable() throws Exception {
        mvc.perform(get("/users/{userId}/avatar", userId)).andExpect(status().isUnauthorized());
        verifyNoInteractions(avatarService);
    }

    @Test
    void removalReturnsNoContent() throws Exception {
        mvc.perform(delete("/users/me/avatar").with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));
        verify(avatarService).removeAvatar();
    }

    @Test
    void writeAndRemoveOperationsRequireAuthentication() throws Exception {
        mvc.perform(delete("/users/me/avatar")).andExpect(status().isUnauthorized());
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar").file(file)).andExpect(status().isUnauthorized());
        verifyNoInteractions(avatarService);
    }

    @Test
    void rejectsInvalidBearerToken() throws Exception {
        when(decoder.decode("invalid")).thenThrow(new BadJwtException("Invalid token"));
        mvc.perform(delete("/users/me/avatar").header("Authorization", "Bearer invalid"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(avatarService);
    }

    @Test
    void missingFileReturnsUsefulError() throws Exception {
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar")
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Image file is required"))
                .andExpect(jsonPath("$.fieldErrors.file").value("must be provided"));
        verifyNoInteractions(avatarService);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 413, 415, 503})
    void mapsUploadErrorsToHttpResponses(int status) throws Exception {
        when(avatarService.uploadAvatar(any()))
                .thenThrow(new AvatarException(HttpStatus.valueOf(status), "Upload failed"));
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar")
                        .file(file)
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().is(status))
                .andExpect(jsonPath("$.message").value("Upload failed"));
    }

    @Test
    void reportsStorageUnavailable() throws Exception {
        when(avatarService.uploadAvatar(any())).thenThrow(new StorageException(new RuntimeException("S3 failed")));
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar")
                        .file(file)
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Object storage operation failed"));
    }

    @Test
    void mapsMultipartLimitException() throws Exception {
        when(avatarService.uploadAvatar(any())).thenThrow(new MaxUploadSizeExceededException(2097152));
        mvc.perform(multipart(HttpMethod.PUT, "/users/me/avatar")
                        .file(file)
                        .with(jwt().jwt(token -> token.subject(userId.toString()))))
                .andExpect(status().isPayloadTooLarge());
    }
}
