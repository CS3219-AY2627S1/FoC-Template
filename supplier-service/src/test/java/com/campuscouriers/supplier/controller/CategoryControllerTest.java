/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated controller tests for category creation, listing, and administration.
 */
package com.campuscouriers.supplier.controller;

import com.campuscouriers.supplier.dto.CategoryResponse;
import com.campuscouriers.supplier.dto.CreateCategoryRequest;
import com.campuscouriers.supplier.entity.CategoryStatus;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.exception.DuplicateCategoryException;
import com.campuscouriers.supplier.exception.GlobalExceptionHandler;
import com.campuscouriers.supplier.service.CategoryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(CategoryController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class CategoryControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CategoryService categoryService;

    @Test
    void findActive_returnsItems() throws Exception {
        UUID id = UUID.randomUUID();
        when(categoryService.findActive()).thenReturn(new ItemListResponse<>(List.of(
                new CategoryResponse(id, "Food", CategoryStatus.ACTIVE)
        )));

        mockMvc.perform(get("/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id.toString()))
                .andExpect(jsonPath("$.items[0].name").value("Food"));
    }

    @Test
    void findDeactivated_returnsRetiredItems() throws Exception {
        UUID id = UUID.randomUUID();
        when(categoryService.findDeactivated()).thenReturn(new ItemListResponse<>(List.of(
                new CategoryResponse(id, "Old Food", CategoryStatus.RETIRED))));

        mockMvc.perform(get("/categories/deactivated"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].status").value("RETIRED"));
    }

    @Test
    void create_validRequest_returns201() throws Exception {
        UUID id = UUID.randomUUID();
        when(categoryService.create(new CreateCategoryRequest("Food")))
                .thenReturn(new CategoryResponse(id, "Food", CategoryStatus.ACTIVE));

        mockMvc.perform(post("/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Food\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/categories/" + id))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("Food"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void create_blankName_returns400WithoutCallingService() throws Exception {
        mockMvc.perform(post("/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(categoryService);
    }

    @Test
    void create_nameLongerThan60Characters_returns400WithoutCallingService() throws Exception {
        String name = "a".repeat(61);

        mockMvc.perform(post("/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(categoryService);
    }

    @Test
    void create_duplicateName_returns409ProblemDetail() throws Exception {
        doThrow(new DuplicateCategoryException("Food"))
                .when(categoryService).create(any(CreateCategoryRequest.class));

        mockMvc.perform(post("/categories")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Food\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail").value("A category named 'Food' already exists"));
    }

    @Test
    void detailUpdateDeactivateAndReactivate_areExposed() throws Exception {
        UUID id = UUID.randomUUID();
        when(categoryService.findById(id)).thenReturn(new CategoryResponse(id, "Food", CategoryStatus.ACTIVE));
        when(categoryService.update(any(), any())).thenReturn(new CategoryResponse(id, "Dining", CategoryStatus.ACTIVE));
        when(categoryService.deactivate(id)).thenReturn(new CategoryResponse(id, "Dining", CategoryStatus.RETIRED));
        when(categoryService.reactivate(id)).thenReturn(new CategoryResponse(id, "Dining", CategoryStatus.ACTIVE));

        mockMvc.perform(get("/categories/{id}", id)).andExpect(status().isOk());
        mockMvc.perform(put("/categories/{id}", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Dining\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Dining"));
        mockMvc.perform(post("/categories/{id}/deactivate", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RETIRED"));
        mockMvc.perform(post("/categories/{id}/reactivate", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
    }
}
