package sg.edu.nus.foc.order.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.data.web.PageableHandlerMethodArgumentResolver;
import org.springframework.data.web.config.PageableHandlerMethodArgumentResolverCustomizer;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.web.client.RestClient;
import org.springframework.web.context.request.ServletWebRequest;
import sg.edu.nus.foc.order.api.AdminOrderController;
import sg.edu.nus.foc.order.security.EmulatorJwtDecoder;
import sg.edu.nus.foc.order.security.HttpUserServiceRoleProvider;
import sg.edu.nus.foc.order.security.JsonSecurityHandlers;
import sg.edu.nus.foc.order.security.MockUserServiceRoleProvider;
import sg.edu.nus.foc.order.security.RoleLookupException;
import tools.jackson.databind.json.JsonMapper;

class OrderSecurityConfigurationTest {
    private final SecurityConfiguration configuration = new SecurityConfiguration();

    @Test
    void selectsEmulatorOrFirebaseJwtDecoderFromAuthConfiguration() {
        assertInstanceOf(EmulatorJwtDecoder.class, configuration.jwtDecoder("demo-foc", "localhost:9099"));
        assertInstanceOf(NimbusJwtDecoder.class, configuration.jwtDecoder("demo-foc", ""));
    }

    @Test
    void selectsMockOrHttpRoleProviderAndRejectsInvalidConfiguration() {
        assertInstanceOf(MockUserServiceRoleProvider.class, configuration.roleProvider(
                "mock", "", "admin@u.nus.edu", Duration.ofSeconds(1), RestClient.builder()));
        assertInstanceOf(HttpUserServiceRoleProvider.class, configuration.roleProvider(
                "http", "http://user-service", "", Duration.ofSeconds(1), RestClient.builder()));
        assertThrows(IllegalStateException.class, () -> configuration.roleProvider(
                "http", " ", "", Duration.ofSeconds(1), RestClient.builder()));
        assertThrows(IllegalStateException.class, () -> configuration.roleProvider(
                "unknown", "http://user-service", "", Duration.ofSeconds(1), RestClient.builder()));
    }

    @Test
    void pageableParametersAreOneBasedAndCappedAtOneHundred() throws Exception {
        PageableHandlerMethodArgumentResolver resolver = new PageableHandlerMethodArgumentResolver();
        PageableHandlerMethodArgumentResolverCustomizer customizer = configuration.pageableResolverCustomizer();
        customizer.customize(resolver);
        MethodParameter parameter = new MethodParameter(AdminOrderController.class.getMethod(
                "listOrders", sg.edu.nus.foc.order.domain.OrderStatus.class,
                org.springframework.data.domain.Pageable.class, String.class, java.time.Instant.class, java.time.Instant.class, boolean.class), 1);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setParameter("page", "2");
        request.setParameter("size", "500");

        org.springframework.data.domain.Pageable pageable = resolver.resolveArgument(
                parameter, null, new ServletWebRequest(request), null);

        assertEquals(1, pageable.getPageNumber());
        assertEquals(100, pageable.getPageSize());
    }

    @Test
    void securityHandlersWriteJson401403AndDependency503() throws Exception {
        JsonSecurityHandlers handlers = new JsonSecurityHandlers(JsonMapper.builder().build());
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/orders");
        MockHttpServletResponse unauthenticated = new MockHttpServletResponse();
        handlers.commence(request, unauthenticated, new BadCredentialsException("bad token"));
        assertEquals(401, unauthenticated.getStatus());

        MockHttpServletResponse forbidden = new MockHttpServletResponse();
        handlers.handle(request, forbidden, new AccessDeniedException("not admin"));
        assertEquals(403, forbidden.getStatus());

        MockHttpServletResponse unavailable = new MockHttpServletResponse();
        handlers.commence(request, unavailable, new AuthenticationServiceException(
                "role lookup failed", new RoleLookupException("offline", new IllegalStateException())));
        assertEquals(503, unavailable.getStatus());
    }
}
