package com.friendoncampus.user.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class UserSpaControllerTest {

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new UserSpaController())
            .build();

    @Test
    void forwardsTheGatewayHomeToThePackagedUserSpa() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/user-assets/index.html"));
    }
}
