/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), dates: 2026-09-30 and 2026-10-02
 * Scope: Generated CORS preflight tests and updated allowed methods for lifecycle PATCH endpoints.
 */
package com.campuscouriers.supplier.config;

import com.campuscouriers.supplier.controller.SupplierController;
import com.campuscouriers.supplier.service.SupplierService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.mockito.Mockito.when;

import com.campuscouriers.supplier.dto.PageMetadata;
import com.campuscouriers.supplier.dto.SupplierPageResponse;
import java.util.List;

@WebMvcTest(SupplierController.class)
@Import(SecurityConfig.class)
class SecurityConfigTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SupplierService supplierService;

    @Test
    void preflight_fromConfiguredFrontendOrigin_isAllowed() throws Exception {
        mockMvc.perform(options("/suppliers")
                        .header("Origin", "http://localhost:5173")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:5173"))
                .andExpect(header().string("Access-Control-Allow-Methods",
                        "GET,POST,PUT,PATCH,DELETE,OPTIONS"));
    }

    @Test
    void preflight_fromUnknownOrigin_isRejected() throws Exception {
        mockMvc.perform(options("/suppliers")
                        .header("Origin", "https://untrusted.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void deactivatedSupplierList_requiresAdministrator() throws Exception {
        when(supplierService.findDeactivated(null, null, null, 0, 20, "name,asc"))
                .thenReturn(new SupplierPageResponse(
                        List.of(), new PageMetadata(0, 20, 0, 0, false, false)));

        mockMvc.perform(get("/suppliers/deactivated")
                        .with(jwt().authorities(new SimpleGrantedAuthority("Student"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/suppliers/deactivated")
                        .with(jwt().authorities(new SimpleGrantedAuthority("Administrator"))))
                .andExpect(status().isOk());
    }
}
