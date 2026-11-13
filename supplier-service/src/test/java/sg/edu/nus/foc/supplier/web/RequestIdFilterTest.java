package sg.edu.nus.foc.supplier.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestIdFilterTest {

    private static String requestIdSeenBy(MockHttpServletRequest request) throws Exception {
        AtomicReference<String> seen = new AtomicReference<>();
        MockFilterChain chain = new MockFilterChain() {
            @Override
            public void doFilter(ServletRequest req, ServletResponse res) {
                seen.set(MDC.get(RequestIdFilter.MDC_KEY));
            }
        };
        new RequestIdFilter().doFilter(request, new MockHttpServletResponse(), chain);
        return seen.get();
    }

    @Test
    void usesTheGatewaysRequestIdAndClearsItAfterwards() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/suppliers");
        request.addHeader(RequestIdFilter.HEADER, "0f3c9a7d2b6e4f1a8c5d7e9b0a1c2d3e");

        assertThat(requestIdSeenBy(request)).isEqualTo("0f3c9a7d2b6e4f1a8c5d7e9b0a1c2d3e");
        assertThat(MDC.get(RequestIdFilter.MDC_KEY)).isNull();
    }

    @Test
    void generatesAnIdWhenMissingOrUnsafe() throws Exception {
        assertThat(requestIdSeenBy(new MockHttpServletRequest("GET", "/api/suppliers"))).hasSize(36);

        MockHttpServletRequest forged = new MockHttpServletRequest("GET", "/api/suppliers");
        forged.addHeader(RequestIdFilter.HEADER, "abc\nFAKE LOG LINE");
        assertThat(requestIdSeenBy(forged)).doesNotContain("FAKE").hasSize(36);
    }
}
