package com.friendoncampus.supplier.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SpaControllerTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new SpaController())
            .build();

    @ParameterizedTest
    @ValueSource(strings = {
            "/",
            "/suppliers",
            "/suppliers/example-supplier",
            "/admin/suppliers",
            "/admin/suppliers/example-supplier/edit"
    })
    void forwardsFrontendRoutesToTheSpa(String path) throws Exception {
        mockMvc.perform(get(path))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/supplier-assets/index.html"));
    }
}
