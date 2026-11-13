package com.friendoncampus.supplier.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.ChangeSupplierStatusCommand;
import com.friendoncampus.supplier.service.CreateSupplierCommand;
import com.friendoncampus.supplier.service.DeleteSupplierCommand;
import com.friendoncampus.supplier.service.SupplierNotFoundException;
import com.friendoncampus.supplier.service.SupplierMetadata;
import com.friendoncampus.supplier.service.SupplierImageService;
import com.friendoncampus.supplier.service.SupplierQuery;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.service.SupplierUpdateConflictException;
import com.friendoncampus.supplier.service.SupplierVersionLookup;
import com.friendoncampus.supplier.service.UpdateSupplierCommand;
import com.friendoncampus.supplier.web.error.ApiExceptionHandler;

class SupplierControllerTest {

    private static final UUID ANNA_ID = UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");
    private static final UUID NEW_SUPPLIER_ID =
            UUID.fromString("184a5d15-0714-47ad-9ee9-524bf84f361c");

    private SupplierService supplierService;
    private SupplierVersionLookup supplierVersionLookup;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        supplierService = mock(SupplierService.class);
        SupplierImageService supplierImageService = mock(SupplierImageService.class);
        supplierVersionLookup = mock(SupplierVersionLookup.class);
        mockMvc = MockMvcBuilders
                .standaloneSetup(new SupplierController(supplierService, supplierImageService))
                .setControllerAdvice(new ApiExceptionHandler(supplierVersionLookup))
                .build();
    }

    @Test
    void listsSuppliersInsideItemsEnvelope() throws Exception {
        Supplier anna = supplier(ANNA_ID, "Anna's x Soup Union", SupplierStatus.ACTIVE);
        SupplierQuery defaultQuery = SupplierQuery.from(null, null, null, null, null, null);
        when(supplierService.listActiveSuppliers(defaultQuery)).thenReturn(new PageImpl<>(
                List.of(anna),
                PageRequest.of(0, 20, Sort.by(Sort.Order.asc("name").ignoreCase().nullsLast())),
                21));

        mockMvc.perform(get("/api/suppliers"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].id").value(ANNA_ID.toString()))
                .andExpect(jsonPath("$.items[0].name").value("Anna's x Soup Union"))
                .andExpect(jsonPath("$.items[0].status").value("ACTIVE"))
                .andExpect(jsonPath("$.items[0].version").value(0))
                .andExpect(jsonPath("$.page").value(0))
                .andExpect(jsonPath("$.size").value(20))
                .andExpect(jsonPath("$.totalItems").value(21))
                .andExpect(jsonPath("$.totalPages").value(2));
    }

    @Test
    void forwardsNormalizedCombinedQueryParameters() throws Exception {
        SupplierQuery expectedQuery = SupplierQuery.from(
                " coffee ", " Food ", " Central Library ", "1", "5", "building,desc");
        when(supplierService.listActiveSuppliers(expectedQuery)).thenReturn(
                new PageImpl<>(List.of(), expectedQuery.toPageRequest(), 6));

        mockMvc.perform(get("/api/suppliers")
                        .param("search", " coffee ")
                        .param("type", " Food ")
                        .param("building", " Central Library ")
                        .param("page", "1")
                        .param("size", "5")
                        .param("sort", "building,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalItems").value(6))
                .andExpect(jsonPath("$.totalPages").value(2));

        verify(supplierService).listActiveSuppliers(expectedQuery);
    }

    @Test
    void treatsBlankSearchAndFiltersAsAbsent() throws Exception {
        SupplierQuery expectedQuery = SupplierQuery.from(" ", "", "  ", null, null, null);
        when(supplierService.listActiveSuppliers(expectedQuery)).thenReturn(
                new PageImpl<>(List.of(), expectedQuery.toPageRequest(), 0));

        mockMvc.perform(get("/api/suppliers")
                        .param("search", " ")
                        .param("type", "")
                        .param("building", "  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));

        verify(supplierService).listActiveSuppliers(expectedQuery);
    }

    @Test
    void returnsActiveSupplierMetadata() throws Exception {
        when(supplierService.getActiveSupplierMetadata()).thenReturn(new SupplierMetadata(
                List.of("Food", "Food/Coffee", "Printing", "Shopping"),
                List.of("Blk AS8", "Central Library")));

        mockMvc.perform(get("/api/suppliers/metadata"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.types.length()").value(4))
                .andExpect(jsonPath("$.types[0]").value("Food"))
                .andExpect(jsonPath("$.types[3]").value("Shopping"))
                .andExpect(jsonPath("$.buildings.length()").value(2))
                .andExpect(jsonPath("$.buildings[1]").value("Central Library"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "page=-1", "page=one", "size=0", "size=101", "size=many",
            "sort=id,asc", "sort=name,sideways", "sort=name"
    })
    void returnsProblemDetailForInvalidListQuery(String queryString) throws Exception {
        mockMvc.perform(get("/api/suppliers?" + queryString))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier query"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").isNotEmpty());

        verifyNoInteractions(supplierService);
    }

    @Test
    void retrievesSupplierById() throws Exception {
        Supplier anna = supplier(ANNA_ID, "Anna's x Soup Union", SupplierStatus.ACTIVE);
        when(supplierService.getSupplier(ANNA_ID)).thenReturn(anna);

        mockMvc.perform(get("/api/suppliers/{id}", ANNA_ID))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(ANNA_ID.toString()))
                .andExpect(jsonPath("$.name").value("Anna's x Soup Union"))
                .andExpect(jsonPath("$.openingTime").value("09:00:00"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void returnsProblemDetailForUnknownSupplier() throws Exception {
        when(supplierService.getSupplier(ANNA_ID)).thenThrow(new SupplierNotFoundException(ANNA_ID));

        mockMvc.perform(get("/api/suppliers/{id}", ANNA_ID))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Supplier not found"))
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.detail").value("Supplier with ID " + ANNA_ID + " was not found"))
                .andExpect(jsonPath("$.supplierId").value(ANNA_ID.toString()));
    }

    @Test
    void returnsProblemDetailForMalformedSupplierId() throws Exception {
        mockMvc.perform(get("/api/suppliers/not-a-uuid"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier ID"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("Supplier ID 'not-a-uuid' is not a valid UUID"));

        verifyNoInteractions(supplierService);
    }

    @Test
    void createsSupplierAndReturnsLocationAndResponseBody() throws Exception {
        CreateSupplierCommand expectedCommand = new CreateSupplierCommand(
                "New Campus Cafe",
                "Food/Coffee",
                "COM3",
                "1",
                "Beside the main entrance",
                1.2948,
                103.7716,
                LocalTime.of(8, 0),
                LocalTime.of(18, 0),
                "https://example.com/cafe.jpg",
                SupplierStatus.INACTIVE);
        Supplier created = supplier(
                NEW_SUPPLIER_ID,
                "New Campus Cafe",
                SupplierStatus.INACTIVE);
        when(supplierService.createSupplier(expectedCommand)).thenReturn(created);

        mockMvc.perform(post("/api/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "  New Campus Cafe  ",
                                  "type": " Food/Coffee ",
                                  "building": " COM3 ",
                                  "floor": " 1 ",
                                  "locationDescription": " Beside the main entrance ",
                                  "latitude": 1.2948,
                                  "longitude": 103.7716,
                                  "openingTime": "08:00",
                                  "closingTime": "18:00",
                                  "imageUrl": " https://example.com/cafe.jpg ",
                                  "status": "INACTIVE"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "/api/suppliers/" + NEW_SUPPLIER_ID))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.name").value("New Campus Cafe"))
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.createdAt").value("2026-09-23T00:00:00Z"))
                .andExpect(jsonPath("$.updatedAt").value("2026-09-23T00:00:00Z"));

        verify(supplierService).createSupplier(expectedCommand);
    }

    @Test
    void defaultsStatusAndConvertsBlankOptionalTextToNull() throws Exception {
        CreateSupplierCommand expectedCommand = new CreateSupplierCommand(
                "New Campus Cafe",
                "Food",
                "COM3",
                null,
                null,
                1.2948,
                103.7716,
                LocalTime.of(23, 0),
                null,
                null,
                SupplierStatus.ACTIVE);
        Supplier created = supplier(
                NEW_SUPPLIER_ID,
                "New Campus Cafe",
                SupplierStatus.ACTIVE);
        when(supplierService.createSupplier(expectedCommand)).thenReturn(created);

        mockMvc.perform(post("/api/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "New Campus Cafe",
                                  "type": "Food",
                                  "building": "COM3",
                                  "floor": " ",
                                  "locationDescription": "  ",
                                  "latitude": 1.2948,
                                  "longitude": 103.7716,
                                  "openingTime": "23:00",
                                  "imageUrl": " "
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        verify(supplierService).createSupplier(expectedCommand);
    }

    @Test
    void returnsFieldErrorsForInvalidSupplierRequest() throws Exception {
        mockMvc.perform(post("/api/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": " ",
                                  "type": " ",
                                  "building": " ",
                                  "latitude": 90.01,
                                  "longitude": 180.01,
                                  "imageUrl": "ftp://example.com/image.jpg"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.errors.name").isArray())
                .andExpect(jsonPath("$.errors.type").isArray())
                .andExpect(jsonPath("$.errors.building").isArray())
                .andExpect(jsonPath("$.errors.latitude").isArray())
                .andExpect(jsonPath("$.errors.longitude").isArray())
                .andExpect(jsonPath("$.errors.imageUrl").isArray());

        verifyNoInteractions(supplierService);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{",
            "{\"name\":\"Cafe\",\"type\":\"Food\",\"building\":\"COM3\","
                    + "\"latitude\":1.0,\"longitude\":1.0,\"status\":\"PAUSED\"}",
            "{\"name\":\"Cafe\",\"type\":\"Food\",\"building\":\"COM3\","
                    + "\"latitude\":1.0,\"longitude\":1.0,\"openingTime\":\"25:00\"}"
    })
    void returnsProblemDetailForMalformedSupplierBody(String body) throws Exception {
        mockMvc.perform(post("/api/suppliers")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").isNotEmpty());

        verifyNoInteractions(supplierService);
    }

    @Test
    void returnsProblemDetailWhenSupplierBodyIsMissing() throws Exception {
        mockMvc.perform(post("/api/suppliers")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.status").value(400));

        verifyNoInteractions(supplierService);
    }

    @Test
    void updatesSupplierAndReturnsCompleteResponse() throws Exception {
        UpdateSupplierCommand expectedCommand = new UpdateSupplierCommand(
                "Updated Campus Cafe",
                "Food/Coffee",
                "COM3",
                "2",
                "Now beside the lift",
                1.2948,
                103.7716,
                LocalTime.of(9, 0),
                LocalTime.of(20, 0),
                "https://example.com/updated-cafe.jpg",
                0L);
        Supplier updated = supplier(
                NEW_SUPPLIER_ID,
                "Updated Campus Cafe",
                SupplierStatus.ACTIVE,
                1L);
        when(supplierService.updateSupplier(NEW_SUPPLIER_ID, expectedCommand))
                .thenReturn(updated);

        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": " Updated Campus Cafe ",
                                  "type": " Food/Coffee ",
                                  "building": " COM3 ",
                                  "floor": " 2 ",
                                  "locationDescription": " Now beside the lift ",
                                  "latitude": 1.2948,
                                  "longitude": 103.7716,
                                  "openingTime": "09:00",
                                  "closingTime": "20:00",
                                  "imageUrl": " https://example.com/updated-cafe.jpg ",
                                  "version": 0
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.name").value("Updated Campus Cafe"))
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(1));

        verify(supplierService).updateSupplier(NEW_SUPPLIER_ID, expectedCommand);
    }

    @Test
    void mapsOmittedOptionalUpdateFieldsToNull() throws Exception {
        UpdateSupplierCommand expectedCommand = new UpdateSupplierCommand(
                "Updated Campus Cafe",
                "Food",
                "COM3",
                null,
                null,
                1.2948,
                103.7716,
                null,
                null,
                null,
                2L);
        Supplier updatedSupplier = supplier(
                NEW_SUPPLIER_ID,
                "Updated Campus Cafe",
                SupplierStatus.INACTIVE,
                3L);
        when(supplierService.updateSupplier(NEW_SUPPLIER_ID, expectedCommand))
                .thenReturn(updatedSupplier);

        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Updated Campus Cafe",
                                  "type": "Food",
                                  "building": "COM3",
                                  "latitude": 1.2948,
                                  "longitude": 103.7716,
                                  "status": "ACTIVE",
                                  "version": 2
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.version").value(3));

        verify(supplierService).updateSupplier(NEW_SUPPLIER_ID, expectedCommand);
    }

    @Test
    void returnsFieldErrorsForInvalidUpdateRequest() throws Exception {
        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": " ",
                                  "type": "Food",
                                  "building": "COM3",
                                  "latitude": 90.01,
                                  "longitude": 103.7716,
                                  "imageUrl": "ftp://example.com/image.jpg",
                                  "version": -1
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.errors.name").isArray())
                .andExpect(jsonPath("$.errors.latitude").isArray())
                .andExpect(jsonPath("$.errors.imageUrl").isArray())
                .andExpect(jsonPath("$.errors.version").isArray());

        verifyNoInteractions(supplierService);
    }

    @Test
    void rejectsUpdateWithoutVersion() throws Exception {
        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Updated Campus Cafe",
                                  "type": "Food",
                                  "building": "COM3",
                                  "latitude": 1.2948,
                                  "longitude": 103.7716
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.errors.version").isArray());

        verifyNoInteractions(supplierService);
    }

    @Test
    void returnsProblemDetailForStaleUpdateVersion() throws Exception {
        UpdateSupplierCommand command = updateCommand(0L);
        when(supplierService.updateSupplier(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        0L,
                        1L));

        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson(0L)))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Supplier update conflict"))
                .andExpect(jsonPath("$.status").value(409))
                .andExpect(jsonPath("$.detail")
                        .value("Supplier has changed since the requested version"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.requestedVersion").value(0))
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void resolvesCurrentVersionAfterSimultaneousUpdateConflict() throws Exception {
        UpdateSupplierCommand command = updateCommand(1L);
        when(supplierService.updateSupplier(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        1L,
                        null,
                        new OptimisticLockingFailureException("race")));
        when(supplierVersionLookup.findCurrentVersion(NEW_SUPPLIER_ID))
                .thenReturn(OptionalLong.of(2L));

        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson(1L)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.requestedVersion").value(1))
                .andExpect(jsonPath("$.currentVersion").value(2));

        verify(supplierVersionLookup).findCurrentVersion(NEW_SUPPLIER_ID);
    }

    @Test
    void returnsNotFoundForUpdateOfUnknownSupplier() throws Exception {
        UpdateSupplierCommand command = updateCommand(0L);
        when(supplierService.updateSupplier(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierNotFoundException(NEW_SUPPLIER_ID));

        mockMvc.perform(put("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson(0L)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Supplier not found"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()));
    }

    @Test
    void returnsProblemDetailForMalformedUpdateId() throws Exception {
        mockMvc.perform(put("/api/suppliers/not-a-uuid")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validUpdateJson(0L)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid supplier ID"));

        verifyNoInteractions(supplierService);
    }

    @Test
    void changesSupplierStatusAndReturnsCompleteResponse() throws Exception {
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 0L);
        Supplier updated = supplier(
                NEW_SUPPLIER_ID,
                "Campus Cafe",
                SupplierStatus.INACTIVE,
                1L);
        when(supplierService.changeSupplierStatus(NEW_SUPPLIER_ID, command))
                .thenReturn(updated);

        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("INACTIVE", 0L)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.id").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.name").value("Campus Cafe"))
                .andExpect(jsonPath("$.status").value("INACTIVE"))
                .andExpect(jsonPath("$.version").value(1));

        verify(supplierService).changeSupplierStatus(NEW_SUPPLIER_ID, command);
    }

    @Test
    void returnsCurrentSupplierForStatusNoOp() throws Exception {
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.ACTIVE, 2L);
        Supplier unchanged = supplier(
                NEW_SUPPLIER_ID,
                "Campus Cafe",
                SupplierStatus.ACTIVE,
                2L);
        when(supplierService.changeSupplierStatus(NEW_SUPPLIER_ID, command))
                .thenReturn(unchanged);

        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("ACTIVE", 2L)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.version").value(2));
    }

    @Test
    void returnsFieldErrorsForInvalidStatusRequest() throws Exception {
        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "version": -1
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.errors.status").isArray())
                .andExpect(jsonPath("$.errors.version").isArray());

        verifyNoInteractions(supplierService);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{",
            "{\"status\":\"PAUSED\",\"version\":0}"
    })
    void returnsProblemDetailForMalformedStatusBody(String body) throws Exception {
        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"))
                .andExpect(jsonPath("$.status").value(400));

        verifyNoInteractions(supplierService);
    }

    @Test
    void returnsProblemDetailWhenStatusBodyIsMissing() throws Exception {
        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier request"));

        verifyNoInteractions(supplierService);
    }

    @Test
    void returnsProblemDetailForStaleStatusVersion() throws Exception {
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 0L);
        when(supplierService.changeSupplierStatus(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        0L,
                        1L));

        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("INACTIVE", 0L)))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Supplier update conflict"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.requestedVersion").value(0))
                .andExpect(jsonPath("$.currentVersion").value(1));
    }

    @Test
    void resolvesCurrentVersionAfterSimultaneousStatusConflict() throws Exception {
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.ACTIVE, 1L);
        when(supplierService.changeSupplierStatus(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        1L,
                        null,
                        new OptimisticLockingFailureException("race")));
        when(supplierVersionLookup.findCurrentVersion(NEW_SUPPLIER_ID))
                .thenReturn(OptionalLong.of(2L));

        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("ACTIVE", 1L)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.requestedVersion").value(1))
                .andExpect(jsonPath("$.currentVersion").value(2));

        verify(supplierVersionLookup).findCurrentVersion(NEW_SUPPLIER_ID);
    }

    @Test
    void returnsNotFoundForStatusChangeOfUnknownSupplier() throws Exception {
        ChangeSupplierStatusCommand command =
                new ChangeSupplierStatusCommand(SupplierStatus.INACTIVE, 0L);
        when(supplierService.changeSupplierStatus(NEW_SUPPLIER_ID, command))
                .thenThrow(new SupplierNotFoundException(NEW_SUPPLIER_ID));

        mockMvc.perform(patch("/api/suppliers/{id}/status", NEW_SUPPLIER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("INACTIVE", 0L)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Supplier not found"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()));
    }

    @Test
    void returnsProblemDetailForMalformedStatusSupplierId() throws Exception {
        mockMvc.perform(patch("/api/suppliers/not-a-uuid/status")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(validStatusJson("INACTIVE", 0L)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid supplier ID"));

        verifyNoInteractions(supplierService);
    }

    @Test
    void deletesSupplierAndReturnsEmptyNoContentResponse() throws Exception {
        DeleteSupplierCommand command = new DeleteSupplierCommand(2L);

        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .queryParam("version", "2"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        verify(supplierService).deleteSupplier(NEW_SUPPLIER_ID, command);
    }

    @Test
    void returnsProblemDetailWhenDeleteVersionIsMissing() throws Exception {
        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier query"))
                .andExpect(jsonPath("$.detail").value("version query parameter is required"));

        verifyNoInteractions(supplierService);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "-1", "1.5", "one", "9223372036854775808"})
    void returnsProblemDetailForInvalidDeleteVersion(String version) throws Exception {
        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .queryParam("version", version))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid supplier query"))
                .andExpect(jsonPath("$.detail")
                        .value("version must be a nonnegative whole number"));

        verifyNoInteractions(supplierService);
    }

    @Test
    void returnsProblemDetailForStaleDeleteVersion() throws Exception {
        DeleteSupplierCommand command = new DeleteSupplierCommand(1L);
        org.mockito.Mockito.doThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        1L,
                        2L))
                .when(supplierService)
                .deleteSupplier(NEW_SUPPLIER_ID, command);

        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .queryParam("version", "1"))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Supplier update conflict"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()))
                .andExpect(jsonPath("$.requestedVersion").value(1))
                .andExpect(jsonPath("$.currentVersion").value(2));
    }

    @Test
    void resolvesCurrentVersionAfterSimultaneousDeleteConflict() throws Exception {
        DeleteSupplierCommand command = new DeleteSupplierCommand(2L);
        org.mockito.Mockito.doThrow(new SupplierUpdateConflictException(
                        NEW_SUPPLIER_ID,
                        2L,
                        null,
                        new OptimisticLockingFailureException("race")))
                .when(supplierService)
                .deleteSupplier(NEW_SUPPLIER_ID, command);
        when(supplierVersionLookup.findCurrentVersion(NEW_SUPPLIER_ID))
                .thenReturn(OptionalLong.of(3L));

        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .queryParam("version", "2"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.requestedVersion").value(2))
                .andExpect(jsonPath("$.currentVersion").value(3));

        verify(supplierVersionLookup).findCurrentVersion(NEW_SUPPLIER_ID);
    }

    @Test
    void returnsNotFoundForDeleteOfUnknownSupplier() throws Exception {
        DeleteSupplierCommand command = new DeleteSupplierCommand(0L);
        org.mockito.Mockito.doThrow(new SupplierNotFoundException(NEW_SUPPLIER_ID))
                .when(supplierService)
                .deleteSupplier(NEW_SUPPLIER_ID, command);

        mockMvc.perform(delete("/api/suppliers/{id}", NEW_SUPPLIER_ID)
                        .queryParam("version", "0"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.title").value("Supplier not found"))
                .andExpect(jsonPath("$.supplierId").value(NEW_SUPPLIER_ID.toString()));
    }

    @Test
    void returnsProblemDetailForMalformedDeleteSupplierId() throws Exception {
        mockMvc.perform(delete("/api/suppliers/not-a-uuid")
                        .queryParam("version", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid supplier ID"));

        verifyNoInteractions(supplierService);
    }

    private UpdateSupplierCommand updateCommand(long version) {
        return new UpdateSupplierCommand(
                "Updated Campus Cafe",
                "Food/Coffee",
                "COM3",
                "2",
                "Now beside the lift",
                1.2948,
                103.7716,
                LocalTime.of(9, 0),
                LocalTime.of(20, 0),
                "https://example.com/updated-cafe.jpg",
                version);
    }

    private String validUpdateJson(long version) {
        return """
                {
                  "name": "Updated Campus Cafe",
                  "type": "Food/Coffee",
                  "building": "COM3",
                  "floor": "2",
                  "locationDescription": "Now beside the lift",
                  "latitude": 1.2948,
                  "longitude": 103.7716,
                  "openingTime": "09:00",
                  "closingTime": "20:00",
                  "imageUrl": "https://example.com/updated-cafe.jpg",
                  "version": %d
                }
                """.formatted(version);
    }

    private String validStatusJson(String supplierStatus, long version) {
        return """
                {
                  "status": "%s",
                  "version": %d
                }
                """.formatted(supplierStatus, version);
    }

    private Supplier supplier(UUID id, String name, SupplierStatus status) {
        return supplier(id, name, status, 0L);
    }

    private Supplier supplier(UUID id, String name, SupplierStatus status, long version) {
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
        when(supplier.getImageUrl()).thenReturn("https://example.com/supplier.jpg");
        when(supplier.getStatus()).thenReturn(status);
        when(supplier.getVersion()).thenReturn(version);
        when(supplier.getCreatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        when(supplier.getUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-09-23T00:00:00Z"));
        return supplier;
    }
}
