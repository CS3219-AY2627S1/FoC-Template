package sg.edu.nus.foc.supplier.api;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import sg.edu.nus.foc.supplier.security.InternalOrderSecurityConfiguration;
import sg.edu.nus.foc.supplier.supplier.SupplierService;

@WebMvcTest(controllers = InternalOrderLocationsController.class,
        properties = {"FOC_INTERNAL_ORDER_API_ENABLED=true", "FOC_ENVIRONMENT=production"})
@Import(InternalOrderSecurityConfiguration.class)
class InternalOrderLocationsControllerTest {
    @Autowired MockMvc mvc;
    @MockitoBean SupplierService suppliers;
    @MockitoBean JwtDecoder decoder;
    @MockitoBean java.time.Clock clock;

    @org.junit.jupiter.api.BeforeEach
    void time() {
        when(clock.instant()).thenAnswer(call -> java.time.Instant.now());
    }

    @Test void validatesThroughTheAuthoritativeSupplierServiceWithoutJwt() throws Exception {
        when(suppliers.validatePair("p", "d")).thenReturn(
                new sg.edu.nus.foc.supplier.supplier.PairValidation(true, java.util.List.of()));
        mvc.perform(post("/api/suppliers/internal/order-locations/validate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"pickupSupplierId\":\" p \",\"deliverySupplierId\":\"d\"}")).andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true));
        verify(suppliers).validatePair("p", "d");
        verifyNoInteractions(decoder);
    }

    @Test void invalidInputDoesNotReachSupplierService() throws Exception {
        mvc.perform(post("/api/suppliers/internal/order-locations/validate").contentType(MediaType.APPLICATION_JSON)
                .content("{\"pickupSupplierId\":\"\",\"deliverySupplierId\":\"d\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(suppliers);
    }
}
