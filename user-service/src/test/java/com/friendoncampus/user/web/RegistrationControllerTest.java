package com.friendoncampus.user.web;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.friendoncampus.user.domain.User;
import com.friendoncampus.user.service.DuplicateRegistrationException;
import com.friendoncampus.user.service.RegistrationService;
import com.friendoncampus.user.service.EmailVerificationDeliveryException;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(RegistrationController.class)
@AutoConfigureMockMvc(addFilters = false)
class RegistrationControllerTest {
 @Autowired MockMvc mvc; @MockitoBean RegistrationService registrations;
 @Test void createsRegistration() throws Exception {
  User user=User.register("alice@u.nus.edu","Alice","alice","hash");
  when(registrations.register(anyString(),anyString(),anyString())).thenReturn(user);
  mvc.perform(post("/api/users/registrations").contentType("application/json").content("{\"email\":\"alice@u.nus.edu\",\"username\":\"Alice\",\"password\":\"123456789012345\"}"))
   .andExpect(status().isCreated()).andExpect(jsonPath("$.email").value("alice@u.nus.edu")).andExpect(jsonPath("$.roles[0]").value("REQUESTER")).andExpect(jsonPath("$.status").value("UNVERIFIED"));
 }
 @Test void rejectsInvalidPassword() throws Exception { mvc.perform(post("/api/users/registrations").contentType("application/json").content("{\"email\":\"a@u.nus.edu\",\"username\":\"a\",\"password\":\"short\"}")).andExpect(status().isBadRequest()); }
 @Test void reportsDuplicateEmail() throws Exception { when(registrations.register(anyString(),anyString(),anyString())).thenThrow(new DuplicateRegistrationException("email")); mvc.perform(post("/api/users/registrations").contentType("application/json").content("{\"email\":\"a@u.nus.edu\",\"username\":\"a\",\"password\":\"123456789012345\"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("email is already taken")); }
 @Test void retainsTheUnverifiedAccountButReportsInitialEmailDeliveryFailure() throws Exception { when(registrations.register(anyString(),anyString(),anyString())).thenThrow(new EmailVerificationDeliveryException(new IllegalStateException())); mvc.perform(post("/api/users/registrations").contentType("application/json").content("{\"email\":\"a@u.nus.edu\",\"username\":\"a\",\"password\":\"123456789012345\"}")).andExpect(status().isServiceUnavailable()); }
}
