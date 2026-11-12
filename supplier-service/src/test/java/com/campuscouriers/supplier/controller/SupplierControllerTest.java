/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-10-02
 * Scope: Generated controller tests for supplier creation, retrieval, update, and lifecycle.
 */
package com.campuscouriers.supplier.controller;

import com.campuscouriers.supplier.dto.CreateSupplierRequest;
import com.campuscouriers.supplier.dto.SupplierResponse;
import com.campuscouriers.supplier.dto.SupplierPageResponse;
import com.campuscouriers.supplier.dto.PageMetadata;
import com.campuscouriers.supplier.entity.SupplierStatus;
import com.campuscouriers.supplier.exception.DuplicateSupplierException;
import com.campuscouriers.supplier.exception.GlobalExceptionHandler;
import com.campuscouriers.supplier.exception.ReferenceNotFoundException;
import com.campuscouriers.supplier.exception.InactiveReferencesException;
import com.campuscouriers.supplier.service.SupplierService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalTime;
import java.util.UUID;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SupplierController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class SupplierControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SupplierService supplierService;

    @Test
    void findActive_withFilters_returnsPage() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        SupplierResponse item = new SupplierResponse(
                supplierId,
                "Coffee Bean",
                new SupplierResponse.ReferenceSummary(categoryId, "Food"),
                new SupplierResponse.ReferenceSummary(buildingId, "COM3"),
                "1",
                "Near the entrance",
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null,
                SupplierStatus.ACTIVE
        );
        when(supplierService.findActive("coffee", categoryId, buildingId, 0, 10, "name,desc"))
                .thenReturn(new SupplierPageResponse(
                        List.of(item), new PageMetadata(0, 10, 1, 1, false, false)));

        mockMvc.perform(get("/suppliers")
                        .param("q", "coffee")
                        .param("categoryId", categoryId.toString())
                        .param("buildingId", buildingId.toString())
                        .param("page", "0")
                        .param("size", "10")
                        .param("sort", "name,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(supplierId.toString()))
                .andExpect(jsonPath("$.items[0].description").value("Near the entrance"))
                .andExpect(jsonPath("$.page.number").value(0))
                .andExpect(jsonPath("$.page.totalElements").value(1));
    }

    @Test
    void findActive_invalidSize_returns400() throws Exception {
        doThrow(new com.campuscouriers.supplier.exception.InvalidQueryParameterException(
                "Size must be between 1 and 100"))
                .when(supplierService).findActive(null, null, null, 0, 101, "name,asc");

        mockMvc.perform(get("/suppliers").param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Size must be between 1 and 100"));
    }

    @Test
    void findDeactivated_returnsInactivePage() throws Exception {
        when(supplierService.findDeactivated(null, null, null, 0, 20, "name,asc"))
                .thenReturn(new SupplierPageResponse(
                        List.of(), new PageMetadata(0, 20, 0, 0, false, false)));

        mockMvc.perform(get("/suppliers/deactivated"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    @Test
    void create_validRequest_returns201() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        when(supplierService.create(any(CreateSupplierRequest.class))).thenReturn(new SupplierResponse(
                supplierId,
                "Coffee Bean",
                new SupplierResponse.ReferenceSummary(categoryId, "Food"),
                new SupplierResponse.ReferenceSummary(buildingId, "COM3"),
                "1",
                "Near the main entrance",
                LocalTime.of(9, 0),
                LocalTime.of(18, 0),
                null,
                SupplierStatus.ACTIVE
        ));

        mockMvc.perform(post("/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJson(categoryId, buildingId)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/suppliers/" + supplierId))
                .andExpect(jsonPath("$.id").value(supplierId.toString()))
                .andExpect(jsonPath("$.name").value("Coffee Bean"))
                .andExpect(jsonPath("$.category.id").value(categoryId.toString()))
                .andExpect(jsonPath("$.building.name").value("COM3"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void create_missingRequiredFields_returns400WithoutCallingService() throws Exception {
        mockMvc.perform(post("/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(supplierService);
    }

    @Test
    void create_nameLongerThan60Characters_returns400WithoutCallingService() throws Exception {
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        String body = """
                {
                  "name": "%s",
                  "categoryId": "%s",
                  "buildingId": "%s"
                }
                """.formatted("a".repeat(61), categoryId, buildingId);

        mockMvc.perform(post("/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(supplierService);
    }

    @Test
    void create_unknownCategory_returns404ProblemDetail() throws Exception {
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        doThrow(new ReferenceNotFoundException("Category", categoryId))
                .when(supplierService).create(any(CreateSupplierRequest.class));

        mockMvc.perform(post("/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJson(categoryId, buildingId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void create_duplicateBranch_returns409ProblemDetail() throws Exception {
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        doThrow(new DuplicateSupplierException("Coffee Bean"))
                .when(supplierService).create(any(CreateSupplierRequest.class));

        mockMvc.perform(post("/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJson(categoryId, buildingId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void findActiveById_existingSupplier_returns200() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        when(supplierService.findActiveById(supplierId))
                .thenReturn(response(supplierId, categoryId, buildingId, "Coffee Bean"));

        mockMvc.perform(get("/suppliers/{id}", supplierId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(supplierId.toString()))
                .andExpect(jsonPath("$.name").value("Coffee Bean"));
    }

    @Test
    void update_validRequest_returns200() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        when(supplierService.update(org.mockito.ArgumentMatchers.eq(supplierId), any()))
                .thenReturn(response(supplierId, categoryId, buildingId, "Updated Shop"));

        mockMvc.perform(put("/suppliers/{id}", supplierId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validJson(categoryId, buildingId).replace("Coffee Bean", "Updated Shop")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(supplierId.toString()))
                .andExpect(jsonPath("$.name").value("Updated Shop"));
    }

    @Test
    void update_invalidRequest_returns400WithoutCallingService() throws Exception {
        mockMvc.perform(put("/suppliers/{id}", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(supplierService);
    }

    @Test
    void deactivate_existingSupplier_returns200WithInactiveStatus() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        SupplierResponse inactive = new SupplierResponse(
                supplierId, "Coffee Bean",
                new SupplierResponse.ReferenceSummary(categoryId, "Food"),
                new SupplierResponse.ReferenceSummary(buildingId, "COM3"),
                "1", "Near the main entrance", LocalTime.of(9, 0),
                LocalTime.of(18, 0), null, SupplierStatus.INACTIVE);
        when(supplierService.deactivate(supplierId)).thenReturn(inactive);

        mockMvc.perform(patch("/suppliers/{id}/deactivate", supplierId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(supplierId.toString()))
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }

    @Test
    void deactivate_unknownSupplier_returns404() throws Exception {
        UUID supplierId = UUID.randomUUID();
        doThrow(new ReferenceNotFoundException("Supplier", supplierId))
                .when(supplierService).deactivate(supplierId);

        mockMvc.perform(patch("/suppliers/{id}/deactivate", supplierId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void reactivate_inactiveSupplier_returns200WithActiveStatus() throws Exception {
        UUID supplierId = UUID.randomUUID();
        UUID categoryId = UUID.randomUUID();
        UUID buildingId = UUID.randomUUID();
        SupplierResponse active = response(
                supplierId, categoryId, buildingId, "Coffee Bean");
        when(supplierService.reactivate(supplierId)).thenReturn(active);

        mockMvc.perform(patch("/suppliers/{id}/reactivate", supplierId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(supplierId.toString()))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void reactivate_unknownSupplier_returns404() throws Exception {
        UUID supplierId = UUID.randomUUID();
        doThrow(new ReferenceNotFoundException("Supplier", supplierId))
                .when(supplierService).reactivate(supplierId);

        mockMvc.perform(patch("/suppliers/{id}/reactivate", supplierId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void reactivate_withInactiveCategoryAndBuilding_returnsBothReferences() throws Exception {
        UUID supplierId = UUID.randomUUID();
        doThrow(new InactiveReferencesException(List.of("category", "building")))
                .when(supplierService).reactivate(supplierId);

        mockMvc.perform(patch("/suppliers/{id}/reactivate", supplierId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.inactiveReferences[0]").value("category"))
                .andExpect(jsonPath("$.inactiveReferences[1]").value("building"));
    }

    private SupplierResponse response(
            UUID supplierId, UUID categoryId, UUID buildingId, String name) {
        return new SupplierResponse(
                supplierId, name,
                new SupplierResponse.ReferenceSummary(categoryId, "Food"),
                new SupplierResponse.ReferenceSummary(buildingId, "COM3"),
                "1", "Near the main entrance", LocalTime.of(9, 0),
                LocalTime.of(18, 0), null, SupplierStatus.ACTIVE);
    }

    private String validJson(UUID categoryId, UUID buildingId) {
        return """
                {
                  "name": "Coffee Bean",
                  "categoryId": "%s",
                  "buildingId": "%s",
                  "floor": "1",
                  "description": "Near the main entrance",
                  "openingTime": "09:00:00",
                  "closingTime": "18:00:00"
                }
                """.formatted(categoryId, buildingId);
    }
}
