/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-26 to 2026-11-10
 * Scope: Generated controller tests for building creation, listing, and administration.
 */
package com.campuscouriers.supplier.controller;

import com.campuscouriers.supplier.dto.BuildingResponse;
import com.campuscouriers.supplier.dto.CreateBuildingRequest;
import com.campuscouriers.supplier.entity.BuildingStatus;
import com.campuscouriers.supplier.dto.ItemListResponse;
import com.campuscouriers.supplier.exception.DuplicateBuildingException;
import com.campuscouriers.supplier.exception.GlobalExceptionHandler;
import com.campuscouriers.supplier.service.BuildingService;
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

@WebMvcTest(BuildingController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(GlobalExceptionHandler.class)
class BuildingControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BuildingService buildingService;

    @Test
    void findActive_returnsItems() throws Exception {
        UUID id = UUID.randomUUID();
        when(buildingService.findActive()).thenReturn(new ItemListResponse<>(List.of(
                new BuildingResponse(id, "COM3", BuildingStatus.ACTIVE)
        )));

        mockMvc.perform(get("/buildings"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(id.toString()))
                .andExpect(jsonPath("$.items[0].name").value("COM3"));
    }

    @Test
    void findDeactivated_returnsRetiredItems() throws Exception {
        UUID id = UUID.randomUUID();
        when(buildingService.findDeactivated()).thenReturn(new ItemListResponse<>(List.of(
                new BuildingResponse(id, "Old Block", BuildingStatus.RETIRED))));

        mockMvc.perform(get("/buildings/deactivated"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].status").value("RETIRED"));
    }

    @Test
    void create_validRequest_returns201() throws Exception {
        UUID id = UUID.randomUUID();
        when(buildingService.create(new CreateBuildingRequest("COM3")))
                .thenReturn(new BuildingResponse(id, "COM3", BuildingStatus.ACTIVE));

        mockMvc.perform(post("/buildings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"COM3\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/buildings/" + id))
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("COM3"))
                .andExpect(jsonPath("$.status").value("ACTIVE"));
    }

    @Test
    void create_overlongName_returns400WithoutCallingService() throws Exception {
        String name = "a".repeat(61);

        mockMvc.perform(post("/buildings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + name + "\"}"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(buildingService);
    }

    @Test
    void create_duplicateName_returns409ProblemDetail() throws Exception {
        doThrow(new DuplicateBuildingException("COM3"))
                .when(buildingService).create(any(CreateBuildingRequest.class));

        mockMvc.perform(post("/buildings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"COM3\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail").value("A building named 'COM3' already exists"));
    }

    @Test
    void detailUpdateDeactivateAndReactivate_areExposed() throws Exception {
        UUID id = UUID.randomUUID();
        when(buildingService.findById(id)).thenReturn(new BuildingResponse(id, "COM3", BuildingStatus.ACTIVE));
        when(buildingService.update(any(), any())).thenReturn(new BuildingResponse(id, "COM4", BuildingStatus.ACTIVE));
        when(buildingService.deactivate(id)).thenReturn(new BuildingResponse(id, "COM4", BuildingStatus.RETIRED));
        when(buildingService.reactivate(id)).thenReturn(new BuildingResponse(id, "COM4", BuildingStatus.ACTIVE));

        mockMvc.perform(get("/buildings/{id}", id)).andExpect(status().isOk());
        mockMvc.perform(put("/buildings/{id}", id).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"COM4\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("COM4"));
        mockMvc.perform(post("/buildings/{id}/deactivate", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RETIRED"));
        mockMvc.perform(post("/buildings/{id}/reactivate", id))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE"));
    }
}
