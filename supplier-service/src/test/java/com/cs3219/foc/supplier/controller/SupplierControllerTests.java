package com.cs3219.foc.supplier.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.cs3219.foc.supplier.config.SecurityConfig;
import com.cs3219.foc.supplier.exception.GlobalExceptionHandler;
import com.cs3219.foc.supplier.exception.StorageException;
import com.cs3219.foc.supplier.exception.SupplierImageException;
import com.cs3219.foc.supplier.exception.SupplierNotFoundException;
import com.cs3219.foc.supplier.model.dto.OpeningHoursDto;
import com.cs3219.foc.supplier.model.dto.SupplierDto;
import com.cs3219.foc.supplier.model.dto.SupplierRequest;
import com.cs3219.foc.supplier.model.dto.SupplierSearchCriteria;
import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import com.cs3219.foc.supplier.service.SupplierImageService;
import com.cs3219.foc.supplier.service.SupplierService;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

@SpringJUnitWebConfig(SupplierControllerTests.TestConfig.class)
class SupplierControllerTests {
    private static final String VALID_BODY = """
            {"name":"Cool Spot","category":"FOOD","building":"COM2","floor":"1",
             "locationDescription":"Opp LT16","latitude":1.294,"longitude":103.7738,
             "openingHours":[{"dayOfWeek":"MONDAY","opensAt":"09:00","closesAt":"21:30"},
                             {"dayOfWeek":"FRIDAY","opensAt":"18:00","closesAt":"02:00"}]}
            """;

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private SupplierService service;

    @Autowired
    private SupplierImageService imageService;

    private MockMvc mvc;
    private final UUID supplierId = UUID.randomUUID();
    private SupplierDto supplier;

    @BeforeEach
    void setUp() {
        reset(service, imageService);
        mvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();
        supplier = new SupplierDto(
                supplierId,
                "Cool Spot",
                SupplierCategory.FOOD,
                "COM2",
                "1",
                "Opp LT16",
                1.294,
                103.7738,
                List.of(new OpeningHoursDto(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(21, 30))),
                null,
                true,
                OffsetDateTime.now(),
                OffsetDateTime.now());
    }

    private static JwtRequestPostProcessor user() {
        return jwt().authorities(new SimpleGrantedAuthority("ROLE_USER"));
    }

    private static JwtRequestPostProcessor admin() {
        return jwt().authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    @Test
    void rejectsUnauthenticatedRequests() throws Exception {
        mvc.perform(get("/suppliers")).andExpect(status().isUnauthorized());
        verifyNoInteractions(service);
    }

    @Test
    void forwardsIncludeInactiveRequestToTheService() throws Exception {
        when(service.listSuppliers(any())).thenReturn(List.of(supplier));
        mvc.perform(get("/suppliers").param("includeInactive", "true").with(user()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Cool Spot"))
                .andExpect(jsonPath("$[0].openingHours[0].dayOfWeek").value("MONDAY"))
                .andExpect(jsonPath("$[0].openingHours[0].opensAt").value("09:00:00"))
                .andExpect(jsonPath("$[0].openingHours[0].closingDifferentFromOpening")
                        .doesNotExist());
        verify(service).listSuppliers(new SupplierSearchCriteria(null, List.of(), false, true));
    }

    @Test
    void passesSearchAndFiltersToService() throws Exception {
        when(service.listSuppliers(any())).thenReturn(List.of(supplier));
        mvc.perform(get("/suppliers")
                        .param("q", "coffee")
                        .param("category", "FOOD", "COFFEE")
                        .param("openNow", "true")
                        .with(user()))
                .andExpect(status().isOk());
        verify(service)
                .listSuppliers(new SupplierSearchCriteria(
                        "coffee", List.of(SupplierCategory.FOOD, SupplierCategory.COFFEE), true, false));
    }

    @Test
    void rejectsUnknownCategory() throws Exception {
        mvc.perform(get("/suppliers").param("category", "PIZZA").with(user()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("Invalid value for category: PIZZA"
                                + " (expected one of [FOOD, COFFEE, SHOPPING, PRINTING, OTHER])"));
        verifyNoInteractions(service);
    }

    @Test
    void adminCanListInactiveSuppliers() throws Exception {
        when(service.listSuppliers(any())).thenReturn(List.of(supplier));
        mvc.perform(get("/suppliers").param("includeInactive", "true").with(admin()))
                .andExpect(status().isOk());
        verify(service).listSuppliers(new SupplierSearchCriteria(null, List.of(), false, true));
    }

    @Test
    void returnsNotFoundForMissingSupplier() throws Exception {
        when(service.getSupplier(supplierId)).thenThrow(new SupplierNotFoundException(supplierId));
        mvc.perform(get("/suppliers/{id}", supplierId).with(user()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Supplier not found: " + supplierId));
    }

    @Test
    void userCannotChangeSuppliers() throws Exception {
        mvc.perform(post("/suppliers")
                        .with(user())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isForbidden());
        mvc.perform(put("/suppliers/{id}", supplierId)
                        .with(user())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isForbidden());
        mvc.perform(post("/suppliers/{id}/deactivate", supplierId).with(user())).andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }

    @Test
    void adminCreatesSupplier() throws Exception {
        when(service.createSupplier(any())).thenReturn(supplier);
        mvc.perform(post("/suppliers")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(supplierId.toString()));
        verify(service)
                .createSupplier(new SupplierRequest(
                        "Cool Spot",
                        SupplierCategory.FOOD,
                        "COM2",
                        "1",
                        "Opp LT16",
                        1.294,
                        103.7738,
                        List.of(
                                new OpeningHoursDto(DayOfWeek.MONDAY, LocalTime.of(9, 0), LocalTime.of(21, 30)),
                                new OpeningHoursDto(DayOfWeek.FRIDAY, LocalTime.of(18, 0), LocalTime.of(2, 0)))));
    }

    @Test
    void rejectsInvalidSupplier() throws Exception {
        mvc.perform(post("/suppliers")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":" ","category":"FOOD","building":"COM2","latitude":91,
                                 "openingHours":[]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.message").value("Validation failed"))
                .andExpect(jsonPath("$.fieldErrors.name").value("must not be blank"))
                .andExpect(jsonPath("$.fieldErrors.latitude").exists())
                .andExpect(jsonPath("$.fieldErrors.openingHours").value("must not be empty"));
        verifyNoInteractions(service);
    }

    @Test
    void rejectsRepeatedDaysAndIdenticalOpeningAndClosingTimes() throws Exception {
        mvc.perform(post("/suppliers")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Cool Spot","category":"FOOD","building":"COM2",
                                 "openingHours":[{"dayOfWeek":"MONDAY","opensAt":"09:00","closesAt":"09:00"},
                                                 {"dayOfWeek":"MONDAY","opensAt":"10:00","closesAt":"12:00"}]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.eachDayListedOnce").value("each day can only be listed once"))
                .andExpect(jsonPath("$.fieldErrors['openingHours[0].closingDifferentFromOpening']")
                        .value("closing time must be different from opening time"));
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "null", "{", "{\"category\":\"INVALID\"}"})
    void reportsUnreadableRequests(String body) throws Exception {
        mvc.perform(post("/suppliers")
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.message").value("Request body is missing or contains invalid fields"))
                .andExpect(jsonPath("$.fieldErrors").isEmpty());
        verifyNoInteractions(service);
    }

    @Test
    void adminUpdatesAndDeactivatesSupplier() throws Exception {
        when(service.updateSupplier(eq(supplierId), any())).thenReturn(supplier);
        when(service.setSupplierActive(supplierId, false)).thenReturn(supplier);
        mvc.perform(put("/suppliers/{id}", supplierId)
                        .with(admin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(VALID_BODY))
                .andExpect(status().isOk());
        mvc.perform(post("/suppliers/{id}/deactivate", supplierId).with(admin()))
                .andExpect(status().isOk());
        verify(service).setSupplierActive(supplierId, false);
    }

    @Test
    void publicImageEndpointIsNotAvailable() throws Exception {
        mvc.perform(get("/suppliers/{id}/image", supplierId)).andExpect(status().isUnauthorized());
        verifyNoInteractions(imageService);
    }

    @Test
    void onlyAdminsCanUploadOrRemoveImages() throws Exception {
        var file = new MockMultipartFile("file", "photo.png", "image/png", new byte[] {1});
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .file(file))
                .andExpect(status().isUnauthorized());
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .file(file)
                        .with(user()))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/suppliers/{id}/image", supplierId).with(user())).andExpect(status().isForbidden());
        verifyNoInteractions(imageService);

        when(imageService.uploadSupplierImage(eq(supplierId), any())).thenReturn(supplier);
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .file(file)
                        .with(admin()))
                .andExpect(status().isOk());
        verify(imageService).uploadSupplierImage(eq(supplierId), any());
    }

    @Test
    void rejectsMissingImageFileBeforeCallingService() throws Exception {
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .with(admin()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"))
                .andExpect(jsonPath("$.fieldErrors.file").value("must be provided"));
        verifyNoInteractions(imageService);
    }

    @Test
    void reportsStorageUnavailable() throws Exception {
        when(imageService.uploadSupplierImage(eq(supplierId), any()))
                .thenThrow(new StorageException(new RuntimeException("S3 failed")));
        var file = new MockMultipartFile("file", "photo.png", "image/png", new byte[] {1});
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .file(file)
                        .with(admin()))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Object storage operation failed"));
    }

    @Test
    void reportsImageErrorsWithTheirStatus() throws Exception {
        when(imageService.uploadSupplierImage(eq(supplierId), any()))
                .thenThrow(new SupplierImageException(
                        HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Only JPEG and PNG images are supported"));
        var file = new MockMultipartFile("file", "notes.txt", "text/plain", new byte[] {1});
        mvc.perform(multipart(HttpMethod.PUT, "/suppliers/{id}/image", supplierId)
                        .file(file)
                        .with(admin()))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.message").value("Only JPEG and PNG images are supported"));
    }

    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({SupplierController.class, SecurityConfig.class, GlobalExceptionHandler.class})
    static class TestConfig {
        @Bean
        SupplierService supplierService() {
            return mock(SupplierService.class);
        }

        @Bean
        SupplierImageService supplierImageService() {
            return mock(SupplierImageService.class);
        }

        @Bean
        JwtDecoder jwtDecoder() {
            return mock(JwtDecoder.class);
        }
    }
}
