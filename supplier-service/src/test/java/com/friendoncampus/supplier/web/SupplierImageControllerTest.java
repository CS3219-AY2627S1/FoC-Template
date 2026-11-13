package com.friendoncampus.supplier.web;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.friendoncampus.supplier.domain.Supplier;
import com.friendoncampus.supplier.domain.SupplierStatus;
import com.friendoncampus.supplier.service.SupplierImageService;
import com.friendoncampus.supplier.service.SupplierService;
import com.friendoncampus.supplier.service.SupplierVersionLookup;
import com.friendoncampus.supplier.web.error.ApiExceptionHandler;

class SupplierImageControllerTest {

    private final UUID supplierId = UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");
    private SupplierImageService imageService;
    private MockMvc publicMvc;
    private MockMvc adminMvc;

    @BeforeEach
    void setUp() {
        SupplierService supplierService = mock(SupplierService.class);
        imageService = mock(SupplierImageService.class);
        SupplierVersionLookup versionLookup = mock(SupplierVersionLookup.class);
        ApiExceptionHandler advice = new ApiExceptionHandler(versionLookup);
        publicMvc = MockMvcBuilders
                .standaloneSetup(new SupplierController(supplierService, imageService))
                .setControllerAdvice(advice)
                .build();
        adminMvc = MockMvcBuilders
                .standaloneSetup(new AdminSupplierController(supplierService, imageService))
                .setControllerAdvice(advice)
                .build();
    }

    @Test
    void streamsUploadedImageWithContentTypeAndCacheHeaders() throws Exception {
        byte[] content = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};
        when(imageService.load(supplierId)).thenReturn(
                new SupplierImageService.SupplierImage("image/jpeg", content, 3L));

        publicMvc.perform(get("/api/suppliers/{id}/image", supplierId))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.IMAGE_JPEG))
                .andExpect(content().bytes(content))
                .andExpect(header().string(HttpHeaders.ETAG,
                        "\"supplier-" + supplierId + "-v3\""))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL,
                        org.hamcrest.Matchers.containsString("immutable")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void uploadsMultipartImageUsingOptimisticVersion() throws Exception {
        byte[] content = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        MockMultipartFile file = new MockMultipartFile(
                "file", "location.png", "image/png", content);
        Supplier supplier = supplier(4L, true);
        when(imageService.upload(
                org.mockito.ArgumentMatchers.eq(supplierId),
                org.mockito.ArgumentMatchers.eq(3L),
                org.mockito.ArgumentMatchers.any(MockMultipartFile.class)))
                .thenReturn(supplier);

        adminMvc.perform(multipart("/api/admin/suppliers/{id}/image", supplierId)
                        .file(file)
                        .param("version", "3")
                        .with(request -> {
                            request.setMethod("PUT");
                            return request;
                        }))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageSource").value("UPLOAD"))
                .andExpect(jsonPath("$.imageUrl")
                        .value("/api/suppliers/" + supplierId + "/image?v=4"));

        verify(imageService).upload(
                org.mockito.ArgumentMatchers.eq(supplierId),
                org.mockito.ArgumentMatchers.eq(3L),
                org.mockito.ArgumentMatchers.any(MockMultipartFile.class));
    }

    @Test
    void removesEitherImageSourceUsingOptimisticVersion() throws Exception {
        Supplier supplier = supplier(5L, false);
        when(imageService.remove(supplierId, 4L)).thenReturn(supplier);

        adminMvc.perform(delete("/api/admin/suppliers/{id}/image", supplierId)
                        .param("version", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageUrl").doesNotExist())
                .andExpect(jsonPath("$.imageSource").doesNotExist());

        verify(imageService).remove(supplierId, 4L);
    }

    private Supplier supplier(long version, boolean uploaded) {
        Supplier supplier = mock(Supplier.class);
        when(supplier.getId()).thenReturn(supplierId);
        when(supplier.getName()).thenReturn("Campus Cafe");
        when(supplier.getType()).thenReturn("Food");
        when(supplier.getBuilding()).thenReturn("COM3");
        when(supplier.getStatus()).thenReturn(SupplierStatus.ACTIVE);
        when(supplier.getVersion()).thenReturn(version);
        when(supplier.getCreatedAt()).thenReturn(OffsetDateTime.parse("2026-11-11T00:00:00Z"));
        when(supplier.getUpdatedAt()).thenReturn(OffsetDateTime.parse("2026-11-11T00:00:00Z"));
        when(supplier.hasUploadedImage()).thenReturn(uploaded);
        return supplier;
    }
}
