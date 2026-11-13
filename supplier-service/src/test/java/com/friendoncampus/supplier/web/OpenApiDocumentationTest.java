package com.friendoncampus.supplier.web;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.friendoncampus.supplier.repository.SupplierRepository;

@SpringBootTest(properties = {
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration"
})
@AutoConfigureMockMvc
class OpenApiDocumentationTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    com.friendoncampus.supplier.authorization.CurrentAuthorization currentAuthorization;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SupplierRepository supplierRepository;

    @Test
    void exposesCompleteSupplierOpenApiContract() throws Exception {
        mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/json"))
                .andExpect(jsonPath("$.openapi", startsWith("3.")))
                .andExpect(jsonPath("$.info.title").value("Friend on Campus Supplier API"))
                .andExpect(jsonPath("$.info.version").value("v1"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.type").value("http"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.bearerFormat").value("JWT"))
                .andExpect(jsonPath("$['paths']['/api/suppliers']['get']['operationId']")
                        .value("listSuppliers"))
                .andExpect(jsonPath("$['paths']['/api/suppliers']['post']['operationId']")
                        .value("createSupplier"))
                .andExpect(jsonPath("$['paths']['/api/suppliers/metadata']['get']['operationId']")
                        .value("getSupplierMetadata"))
                .andExpect(jsonPath("$['paths']['/api/suppliers/metadata']['get']['responses']['200']['content']['*/*']['schema']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['get']['operationId']")
                        .value("getSupplier"))
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}/image']['get']['operationId']")
                        .value("getSupplierImage"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/{id}/image']['put']['operationId']")
                        .value("uploadSupplierImage"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/{id}/image']['delete']['operationId']")
                        .value("removeSupplierImage"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/{id}/image']['delete']['parameters'][?(@.name == 'version')]['required']")
                        .value(true))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/{id}/image']['put']['security'][0].bearerAuth")
                        .isArray())
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['put']['operationId']")
                        .value("updateSupplier"))
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['delete']['operationId']")
                        .value("deleteSupplier"))
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}/status']['patch']['operationId']")
                        .value("changeSupplierStatus"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['operationId']")
                        .value("listSuppliersForAdmin"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/metadata']['get']['operationId']")
                        .value("getAdminSupplierMetadata"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['parameters'][?(@.name == 'status')]['schema']['enum'][0]")
                        .value("ACTIVE"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['parameters'][?(@.name == 'status')]['schema']['enum'][1]")
                        .value("INACTIVE"))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['parameters'][?(@.name == 'page')]['schema']['default']")
                        .value(0))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['parameters'][?(@.name == 'size')]['schema']['maximum']")
                        .value(100))
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['responses']['400']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['responses']['401']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['responses']['403']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers']['get']['security'][0].bearerAuth")
                        .isArray())
                .andExpect(jsonPath("$['paths']['/api/admin/suppliers/metadata']['get']['responses']['200']['content']['*/*']['schema']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers']['get']['parameters'][?(@.name == 'page')]['schema']['default']")
                        .value(0))
                .andExpect(jsonPath("$['paths']['/api/suppliers']['get']['parameters'][?(@.name == 'size')]['schema']['maximum']")
                        .value(100))
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['delete']['parameters'][?(@.name == 'version')]['required']")
                        .value(true))
                .andExpect(jsonPath("$['paths']['/api/suppliers']['post']['responses']['201']['headers']['Location']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers']['post']['responses']['401']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers']['post']['responses']['403']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers']['post']['security'][0].bearerAuth")
                        .isArray())
                .andExpect(jsonPath("$['paths']['/api/suppliers']['get']['responses']['400']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['get']['responses']['404']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['put']['responses']['409']")
                        .exists())
                .andExpect(jsonPath("$['paths']['/api/suppliers/{id}']['delete']['responses']['204']")
                        .exists())
                .andExpect(jsonPath("$['components']['schemas']['SupplierResponse']")
                        .exists())
                .andExpect(jsonPath("$['components']['schemas']['SupplierMetadataResponse']")
                        .exists())
                .andExpect(jsonPath("$['components']['schemas']['SupplierUpdateConflictProblem']")
                        .exists());
    }

    @Test
    void exposesYamlContractAndSwaggerUi() throws Exception {
        mockMvc.perform(get("/v3/api-docs.yaml"))
                .andExpect(status().isOk())
                .andExpect(content().string(startsWith("openapi:")));

        mockMvc.perform(get("/swagger-ui/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Swagger UI")));
    }
}
