package com.friendoncampus.supplier.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.AdminSupplierQuery;
import com.friendoncampus.supplier.service.SupplierMetadata;
import com.friendoncampus.supplier.service.SupplierImageService;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.service.SupplierVersionLookup;
import com.friendoncampus.supplier.web.error.ApiExceptionHandler;

class AdminSupplierControllerTest {

    private static final UUID ACTIVE_ID =
            UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");
    private static final UUID INACTIVE_ID =
            UUID.fromString("c97bc5aa-b68a-4125-9d4a-b147a86aeea2");

    private SupplierService supplierService;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        supplierService = mock(SupplierService.class);
        SupplierImageService supplierImageService = mock(SupplierImageService.class);
        SupplierVersionLookup supplierVersionLookup = mock(SupplierVersionLookup.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new AdminSupplierController(supplierService, supplierImageService))
                .setControllerAdvice(new ApiExceptionHandler(supplierVersionLookup))
                .build();
    }

    @Test
    void listsActiveAndInactiveSuppliersByDefault() throws Exception {
        AdminSupplierQuery query =
                AdminSupplierQuery.from(null, null, null, null, null, null, null);
        Supplier activeSupplier = supplier(ACTIVE_ID, "Active Cafe", SupplierStatus.ACTIVE);
        Supplier inactiveSupplier = supplier(INACTIVE_ID, "Closed Cafe", SupplierStatus.INACTIVE);
        when(supplierService.listSuppliersForAdmin(query)).thenReturn(new PageImpl<>(
                List.of(activeSupplier, inactiveSupplier),
                query.supplierQuery().toPageRequest(),
                21));

        mockMvc.perform(get("/api/admin/suppliers"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[1].status").value("INACTIVE"))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(21))
                .andExpect(jsonPath("$.totalPages").value(2));

        verify(supplierService).listSuppliersForAdmin(query);
    }

    @Test
    void forwardsNormalizedStatusAndSharedQueryParameters() throws Exception {
        AdminSupplierQuery query = AdminSupplierQuery.from(
                " central ",
                " Food ",
                " Central Library ",
                " inactive ",
                "1",
                "5",
                "status,desc");
        when(supplierService.listSuppliersForAdmin(query)).thenReturn(
                new PageImpl<>(List.of(), query.supplierQuery().toPageRequest(), 6));

        mockMvc.perform(get("/api/admin/suppliers")
                        .param("search", " central ")
                        .param("type", " Food ")
                        .param("building", " Central Library ")
                        .param("status", " inactive ")
                        .param("page", "1")
                        .param("size", "5")
                        .param("sort", "status,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(2));

        verify(supplierService).listSuppliersForAdmin(query);
    }

    @Test
    void treatsBlankStatusAsAbsent() throws Exception {
        AdminSupplierQuery query =
                AdminSupplierQuery.from(null, null, null, "  ", null, null, null);
        when(supplierService.listSuppliersForAdmin(query)).thenReturn(
                new PageImpl<>(List.of(), query.supplierQuery().toPageRequest(), 0));

        mockMvc.perform(get("/api/admin/suppliers").param("status", "  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(0));

        verify(supplierService).listSuppliersForAdmin(query);
    }

    @Test
    void returnsMetadataAcrossAllStatuses() throws Exception {
        when(supplierService.getAllSupplierMetadata()).thenReturn(new SupplierMetadata(
                List.of("Food", "Printing"),
                List.of("Central Library", "COM3")));

        mockMvc.perform(get("/api/admin/suppliers/metadata"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.types[0]").value("Food"))
                .andExpect(jsonPath("$.types[1]").value("Printing"))
                .andExpect(jsonPath("$.buildings[0]").value("Central Library"))
                .andExpect(jsonPath("$.buildings[1]").value("COM3"));

        verify(supplierService).getAllSupplierMetadata();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "status=DELETED",
            "page=-1",
            "size=101",
            "sort=id,asc",
            "sort=status,sideways"
    })
    void returnsProblemDetailForInvalidAdminQueries(String queryParameter) throws Exception {
        String[] parts = queryParameter.split("=", 2);

        mockMvc.perform(get("/api/admin/suppliers").param(parts[0], parts[1]))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier query"))
                .andExpect(jsonPath("$.detail").isNotEmpty());

        verifyNoInteractions(supplierService);
    }

    private Supplier supplier(UUID id, String name, SupplierStatus status) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getId()).thenReturn(id);
        when(supplier.getName()).thenReturn(name);
        when(supplier.getType()).thenReturn("Food");
        when(supplier.getBuilding()).thenReturn("Central Library");
        when(supplier.getFloor()).thenReturn("1");
        when(supplier.getLocationDescription()).thenReturn("Next to NUS Co-op");
        when(supplier.getLatitude()).thenReturn(1.296444);
        when(supplier.getLongitude()).thenReturn(103.773032);
        when(supplier.getOpeningTime()).thenReturn(LocalTime.of(9, 0));
        when(supplier.getClosingTime()).thenReturn(LocalTime.of(18, 0));
        when(supplier.getImageUrl()).thenReturn(null);
        when(supplier.getStatus()).thenReturn(status);
        when(supplier.getVersion()).thenReturn(0L);
        when(supplier.getCreatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        when(supplier.getUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        return supplier;
    }
}
