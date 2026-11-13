package com.friendoncampus.order.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class OrderSpaControllerTest {

    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new OrderSpaController()).build();

    @Test
    void forwardsEveryErrandRouteToThePackagedApp() throws Exception {
        for (String path : new String[] {"/errands", "/errands/browse", "/errands/3f2a9c4e-6b1d-4e8f-a7c3-5d9e0b1f2a64"}) {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(forwardedUrl("/order-assets/index.html"));
        }
    }
}
