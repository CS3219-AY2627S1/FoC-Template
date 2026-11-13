package com.friendoncampus.user.web;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import com.friendoncampus.user.service.*;

@WebMvcTest(EmailVerificationController.class) @AutoConfigureMockMvc(addFilters = false)
class EmailVerificationControllerTest {
 @Autowired MockMvc mvc; @MockitoBean EmailVerificationService verifications;
 @Test void verifiesAndResendsAnEmailCode() throws Exception {
  mvc.perform(post("/api/users/email-verifications").contentType("application/json").content("{\"email\":\"alice@u.nus.edu\",\"code\":\"123456\"}")).andExpect(status().isNoContent());
  mvc.perform(post("/api/users/email-verification-resends").contentType("application/json").content("{\"email\":\"alice@u.nus.edu\"}")).andExpect(status().isAccepted());
  verify(verifications).verify("alice@u.nus.edu", "123456"); verify(verifications).resend("alice@u.nus.edu");
 }
 @Test void validatesTheSixDigitCodeAndReportsCooldown() throws Exception {
  mvc.perform(post("/api/users/email-verifications").contentType("application/json").content("{\"email\":\"alice@u.nus.edu\",\"code\":\"abc\"}")).andExpect(status().isBadRequest());
  doThrow(new EmailVerificationCooldownException(90)).when(verifications).resend(anyString());
  mvc.perform(post("/api/users/email-verification-resends").contentType("application/json").content("{\"email\":\"alice@u.nus.edu\"}")).andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "90"));
 }
 @Test void givesSpecificResponsesForKnownAccountStates() throws Exception {
  doThrow(new EmailVerificationNotFoundException()).when(verifications).resend("missing@u.nus.edu");
  mvc.perform(post("/api/users/email-verification-resends").contentType("application/json").content("{\"email\":\"missing@u.nus.edu\"}")).andExpect(status().isNotFound());
  doThrow(new EmailAlreadyVerifiedException()).when(verifications).resend("active@u.nus.edu");
  mvc.perform(post("/api/users/email-verification-resends").contentType("application/json").content("{\"email\":\"active@u.nus.edu\"}")).andExpect(status().isConflict());
  doThrow(new EmailVerificationForbiddenException()).when(verifications).resend("banned@u.nus.edu");
  mvc.perform(post("/api/users/email-verification-resends").contentType("application/json").content("{\"email\":\"banned@u.nus.edu\"}")).andExpect(status().isForbidden());
 }
}
