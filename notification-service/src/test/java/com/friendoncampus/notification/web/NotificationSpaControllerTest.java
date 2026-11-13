package com.friendoncampus.notification.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class NotificationSpaControllerTest {

    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new NotificationSpaController()).build();

    @Test
    void forwardsEveryNotificationsRouteToThePackagedApp() throws Exception {
        for (String path : new String[] {"/notifications", "/notifications/", "/notifications/anything"}) {
            mockMvc.perform(get(path))
                    .andExpect(status().isOk())
                    .andExpect(forwardedUrl("/notification-assets/index.html"));
        }
    }
}
