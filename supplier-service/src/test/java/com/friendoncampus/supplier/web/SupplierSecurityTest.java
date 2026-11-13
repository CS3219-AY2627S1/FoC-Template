package com.friendoncampus.supplier.web;

import static org.mockito.ArgumentMatchers.any;
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

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;

import com.friendoncampus.supplier.repository.SupplierRepository;
import com.friendoncampus.supplier.service.AdminSupplierQuery;
import com.friendoncampus.supplier.service.SupplierMetadata;
import com.friendoncampus.supplier.service.SupplierQuery;
import com.friendoncampus.supplier.service.SupplierService;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration"
})
@AutoConfigureMockMvc
class SupplierSecurityTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.supplier.authorization.CurrentAuthorization currentAuthorization;

    private static final UUID SUPPLIER_ID = UUID.fromString("ca9bd61f-93da-4500-9e9d-48de1bea52fa");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @MockitoBean
    private SupplierService supplierService;

    @MockitoBean
    private SupplierRepository supplierRepository;

    @BeforeEach
    void setUp() {
        when(jwtDecoder.decode("user-token")).thenReturn(jwt("user-token", "REQUESTER"));
        when(jwtDecoder.decode("admin-token")).thenReturn(jwt("admin-token", "ADMIN"));
        when(jwtDecoder.decode("invalid-token")).thenThrow(new BadJwtException("Invalid signature"));
        when(supplierService.listActiveSuppliers(any(SupplierQuery.class)))
                .thenReturn(Page.empty(PageRequest.of(0, 20)));
        when(supplierService.listSuppliersForAdmin(any(AdminSupplierQuery.class)))
                .thenReturn(Page.empty(PageRequest.of(0, 20)));
        when(supplierService.getActiveSupplierMetadata())
                .thenReturn(new SupplierMetadata(List.of(), List.of()));
        when(supplierService.getAllSupplierMetadata())
                .thenReturn(new SupplierMetadata(List.of(), List.of()));
    }

    @Test
    void permitsPublicSupplierReadsAndOperationalResourcesWithoutAToken() throws Exception {
        mockMvc.perform(get("/api/suppliers"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/suppliers/metadata"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/suppliers/{id}/image", SUPPLIER_ID))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk());
    }

    @Test
    void returnsProblemDetailsWhenAProtectedRequestHasNoToken() throws Exception {
        for (RequestBuilder request : protectedRequests()) {
            mockMvc.perform(request)
                    .andExpect(status().isUnauthorized())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(header().string("WWW-Authenticate", "Bearer"))
                    .andExpect(jsonPath("$.title").value("Unauthorized"))
                    .andExpect(jsonPath("$.status").value(401));
        }
    }

    @Test
    void returnsProblemDetailsForAnInvalidBearerToken() throws Exception {
        mockMvc.perform(get("/api/admin/suppliers")
                        .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("A valid bearer token is required"));
    }

    @Test
    void forbidsNormalUsersFromEveryProtectedSupplierRoute() throws Exception {
        for (RequestBuilder request : protectedRequests()) {
            mockMvc.perform(withBearer(request, "user-token"))
                    .andExpect(status().isForbidden())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.title").value("Forbidden"))
                    .andExpect(jsonPath("$.status").value(403));
        }
    }

    @Test
    void permitsAdministratorsToReachEveryProtectedSupplierRoute() throws Exception {
        mockMvc.perform(get("/api/admin/suppliers")
                        .header("Authorization", "Bearer admin-token"))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/admin/suppliers/metadata")
                        .header("Authorization", "Bearer admin-token"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/suppliers")
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/suppliers/{id}", SUPPLIER_ID)
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
        mockMvc.perform(patch("/api/suppliers/{id}/status", SUPPLIER_ID)
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/suppliers/{id}", SUPPLIER_ID)
                        .header("Authorization", "Bearer admin-token"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(delete("/api/admin/suppliers/{id}/image", SUPPLIER_ID)
                        .header("Authorization", "Bearer admin-token"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/admin/suppliers/{id}/image", SUPPLIER_ID)
                        .header("Authorization", "Bearer admin-token")
                        .contentType(MediaType.MULTIPART_FORM_DATA))
                .andExpect(status().isBadRequest());
    }

    private static List<RequestBuilder> protectedRequests() {
        return List.of(
                get("/api/admin/suppliers"),
                get("/api/admin/suppliers/metadata"),
                post("/api/suppliers").contentType(MediaType.APPLICATION_JSON),
                put("/api/suppliers/{id}", SUPPLIER_ID).contentType(MediaType.APPLICATION_JSON),
                patch("/api/suppliers/{id}/status", SUPPLIER_ID).contentType(MediaType.APPLICATION_JSON),
                delete("/api/suppliers/{id}", SUPPLIER_ID),
                put("/api/admin/suppliers/{id}/image", SUPPLIER_ID)
                        .contentType(MediaType.MULTIPART_FORM_DATA),
                delete("/api/admin/suppliers/{id}/image", SUPPLIER_ID));
    }

    private static RequestBuilder withBearer(RequestBuilder request, String token) {
        return request instanceof org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder
                ? builder.header("Authorization", "Bearer " + token)
                : request;
    }

    private static Jwt jwt(String tokenValue, String role) {
        Instant now = Instant.now();
        return Jwt.withTokenValue(tokenValue)
                .header("alg", "RS256")
                .issuer("friend-on-campus-user-service")
                .subject("722d6da3-93f0-4a7d-9820-ab05047a9253")
                .audience(List.of("friend-on-campus-api"))
                .issuedAt(now.minusSeconds(30))
                .expiresAt(now.plusSeconds(600))
                .claim("role", role)
                .build();
    }
}
