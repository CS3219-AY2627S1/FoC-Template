package sg.edu.nus.foc.order.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.mapstruct.factory.Mappers;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import sg.edu.nus.foc.order.api.mapper.ReportDemoMapper;
import sg.edu.nus.foc.order.api.mapper.ReportDemoMapperImpl;
import sg.edu.nus.foc.order.application.adminmock.ReportDemoOrderStore;
import sg.edu.nus.foc.order.application.adminmock.ReportDemoService;

class ReportDemoControllerTest {
    private ApplicationContextRunner context() {
        return new ApplicationContextRunner().withUserConfiguration(ReportDemoController.class,
                ReportDemoService.class, ReportDemoOrderStore.class, ReportDemoMapperImpl.class);
    }

    @Test
    void reportsRequireLocalEnvironmentEmulatorAndExplicitEnablement() {
        for (String environment : new String[] {"staging", "production"}) {
            context().withPropertyValues("order.report-demo.enabled=true", "FOC_ENVIRONMENT=" + environment,
                    "order.security.auth.emulator-host=localhost:9099")
                    .run(c -> assertThat(c).doesNotHaveBean(ReportDemoController.class));
        }
        context().withPropertyValues("order.report-demo.enabled=true", "FOC_ENVIRONMENT=local")
                .run(c -> assertThat(c).doesNotHaveBean(ReportDemoController.class));
        context().withPropertyValues("FOC_ENVIRONMENT=local", "order.security.auth.emulator-host=localhost:9099")
                .run(c -> assertThat(c).doesNotHaveBean(ReportDemoController.class));
        context().withPropertyValues("order.report-demo.enabled=true", "FOC_ENVIRONMENT=local",
                "order.security.auth.emulator-host=localhost:9099")
                .run(c -> assertThat(c).hasSingleBean(ReportDemoController.class));
    }

    @Test
    void localReportsWorkButGenericAdminMockRoutesDoNotExist() throws Exception {
        var mapper = Mappers.getMapper(ReportDemoMapper.class);
        var fixtures = new ReportDemoOrderStore(mapper);
        var mvc = MockMvcBuilders.standaloneSetup(new ReportDemoController(new ReportDemoService(fixtures, mapper)))
                .setControllerAdvice(new OrderExceptionHandler()).build();
        mvc.perform(get("/api/orders/admin-mock/reports").param("userId", "admin").param("mode", "admin"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isArray());
        for (String path : new String[] {"orders", "users", "suppliers", "role-context", "users/id/transactions"}) {
            mvc.perform(get("/api/orders/admin-mock/" + path)).andExpect(status().isNotFound());
        }
    }
}
