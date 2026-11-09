package sg.edu.nus.foc.supplier.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.lessThanOrEqualTo;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import sg.edu.nus.foc.supplier.support.FirestoreEmulator;

/**
 * Full stack: HTTP -> security (token + roles from the mock User Service) -> service -> Firestore
 * emulator, with the real seed CSV loaded at startup. Tests use unique names so they are
 * independent of execution order.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class SupplierApiIntegrationTest {

    private static final String DATABASE = "api-test";
    private static final String ADMIN = "admin@u.nus.edu";
    private static final String STUDENT = "student@u.nus.edu";

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        FirestoreEmulator.clear(DATABASE);
        registry.add("foc.supplier.firestore.emulator-host", FirestoreEmulator::endpoint);
        registry.add("foc.supplier.firestore.database-id", () -> DATABASE);
        registry.add("foc.supplier.seed-file", () -> "src/test/resources/seed/provided-supplier-seed-data.csv");
        registry.add("foc.supplier.user-service.mock-admin-emails", () -> ADMIN);
    }

    @Autowired
    private MockMvc mvc;

    /** A signed-in user; the application resolves their roles (mock User Service) exactly as for a real token. */
    private static RequestPostProcessor as(String email) {
        return jwt().jwt(j -> j.subject("uid-" + email).claim("email", email));
    }

    private static String body(String name) {
        return """
                {"name":"%s","type":"TestType","building":"Test Building","floor":"B1",
                 "locationDescription":"Beside the lift","latitude":1.3050,"longitude":103.7730,
                 "openingTime":"08:00","closingTime":"21:00","imageUrl":"https://example.com/k.jpg"}
                """.formatted(name);
    }

    private String createAsAdmin(String name) throws Exception {
        String json = mvc.perform(post("/api/suppliers").with(as(ADMIN))
                        .contentType(MediaType.APPLICATION_JSON).content(body(name)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }

    private static String unique(String prefix) {
        return prefix + " " + UUID.randomUUID().toString().substring(0, 8);
    }

    // ---- Authentication -------------------------------------------------------

    @Test
    void requestsWithoutATokenAreRejectedWith401() throws Exception {
        mvc.perform(get("/api/suppliers"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", "Bearer"))
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"))
                .andExpect(jsonPath("$.path").value("/api/suppliers"));
    }

    @Test
    void malformedTokensAreRejectedWith401() throws Exception {
        mvc.perform(get("/api/suppliers").header("Authorization", "Bearer not-a-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("UNAUTHENTICATED"));
    }

    @Test
    void healthAndApiDocsArePublic() throws Exception {
        mvc.perform(get("/actuator/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(get("/api/suppliers/v3/api-docs")).andExpect(status().isOk());
    }

    // ---- Reads (all roles) ------------------------------------------------------

    @Test
    void listsTheSeededCatalogueWithPagination() throws Exception {
        mvc.perform(get("/api/suppliers").param("size", "5").with(as(STUDENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.totalItems").value(greaterThanOrEqualTo(21)))
                .andExpect(jsonPath("$.items[0].name").value("A Hot Hideout"))
                .andExpect(jsonPath("$.items[0].openingTime").value("11:00"))
                .andExpect(jsonPath("$.items[0].active").value(true));
    }

    @Test
    void searchesFiltersAndSorts() throws Exception {
        mvc.perform(get("/api/suppliers").param("q", "COFFEE").with(as(STUDENT)))
                .andExpect(jsonPath("$.items[*].name", hasItem("TOMORO COFFEE")))
                .andExpect(jsonPath("$.items[*].name", hasItem("The Coffee Roaster")));
        mvc.perform(get("/api/suppliers").param("type", "printing").with(as(STUDENT)))
                .andExpect(jsonPath("$.totalItems").value(2))
                .andExpect(jsonPath("$.items[*].type", everyItem(containsString("Printing"))));
        mvc.perform(get("/api/suppliers").param("building", "george").with(as(STUDENT)))
                .andExpect(jsonPath("$.totalItems").value(3))
                .andExpect(jsonPath("$.items[0].building").value("Prince George's Park"));
        mvc.perform(get("/api/suppliers").param("sort", "type").param("order", "desc").param("type", "Shopping")
                        .with(as(STUDENT)))
                .andExpect(jsonPath("$.items[0].name").value("Cheers Unmanned Convenience Store"));
        mvc.perform(get("/api/suppliers").param("openNow", "true").param("sort", "updatedAt").with(as(STUDENT)))
                .andExpect(status().isOk());
    }

    @Test
    void findsSuppliersNearAPointSortedByDistance() throws Exception {
        mvc.perform(get("/api/suppliers").param("lat", "1.2942").param("lng", "103.7740").param("radius", "100")
                        .with(as(STUDENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].name").value("Cool Spot"))
                .andExpect(jsonPath("$.items[*].distanceMeters", everyItem(lessThanOrEqualTo(100))));
    }

    @Test
    void emptyResultIsNotAnError() throws Exception {
        mvc.perform(get("/api/suppliers").param("q", "no such supplier").with(as(STUDENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.totalPages").value(0))
                .andExpect(jsonPath("$.message").value("No suppliers match your search."));
    }

    @Test
    void rejectsInvalidQueryParameters() throws Exception {
        mvc.perform(get("/api/suppliers").param("size", "101").with(as(STUDENT)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.details[0].field").value("size"));
        mvc.perform(get("/api/suppliers").param("lat", "1.3").with(as(STUDENT)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("lng"));
        mvc.perform(get("/api/suppliers").param("lng", "103.7").with(as(STUDENT)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("lat"));
        mvc.perform(get("/api/suppliers").param("radius", "50").with(as(STUDENT)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("radius"));
        mvc.perform(get("/api/suppliers").param("sort", "distance").with(as(STUDENT)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("sort"));
        mvc.perform(get("/api/suppliers").param("sort", "popularity").with(as(STUDENT)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].message", containsString("updatedAt")));
        mvc.perform(get("/api/suppliers").param("order", "sideways").with(as(STUDENT)))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/suppliers").param("page", "first").with(as(STUDENT)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.details[0].field").value("page"));
    }

    @Test
    void getsOneSupplierOr404() throws Exception {
        String id = createAsAdmin(unique("Detail Kiosk"));
        mvc.perform(get("/api/suppliers/{id}", id).with(as(STUDENT)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.floor").value("B1"))
                .andExpect(jsonPath("$.imageUrl").value("https://example.com/k.jpg"));
        mvc.perform(get("/api/suppliers/{id}", "missing-id").with(as(STUDENT)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NOT_FOUND"));
    }

    @Test
    void listsTypesAndPermissions() throws Exception {
        mvc.perform(get("/api/suppliers/types").with(as(STUDENT)))
                .andExpect(jsonPath("$.items", hasItem("Food/Coffee")));
        mvc.perform(get("/api/suppliers/permissions").with(as(STUDENT)))
                .andExpect(jsonPath("$.roles.length()").value(2))
                .andExpect(jsonPath("$.email").value(STUDENT))
                .andExpect(jsonPath("$.canManageSuppliers").value(false));
        mvc.perform(get("/api/suppliers/permissions").with(as(ADMIN)))
                .andExpect(jsonPath("$.roles", hasItem("admin")))
                .andExpect(jsonPath("$.canManageSuppliers").value(true));
    }

    // ---- Management (admin only) -------------------------------------------------

    @Test
    void onlyAdminsCanCreateSuppliers() throws Exception {
        String name = unique("New Kiosk");
        mvc.perform(post("/api/suppliers").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON).content(body(name)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("FORBIDDEN"))
                .andExpect(jsonPath("$.message").value("Only administrators can manage suppliers."));

        mvc.perform(post("/api/suppliers").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(body(name)))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", startsWith("/api/suppliers/")))
                .andExpect(jsonPath("$.name").value(name))
                .andExpect(jsonPath("$.active").value(true));

        mvc.perform(post("/api/suppliers").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content(body(name.toUpperCase())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("CONFLICT"));
    }

    @Test
    void createValidatesTheBody() throws Exception {
        mvc.perform(post("/api/suppliers").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\" \",\"latitude\":91,\"openingTime\":\"9am\",\"imageUrl\":\"ftp://x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[*].field", hasItem("name")))
                .andExpect(jsonPath("$.details[*].field", hasItem("building")))
                .andExpect(jsonPath("$.details[*].field", hasItem("latitude")))
                .andExpect(jsonPath("$.details[*].field", hasItem("openingTime")))
                .andExpect(jsonPath("$.details[*].field", hasItem("imageUrl")));
        mvc.perform(post("/api/suppliers").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{oops"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Request body is missing or is not valid JSON."));
    }

    @Test
    void createTreatsBlankOptionalFieldsAsUnset() throws Exception {
        // A form left blank sends empty strings, as PATCH does to clear a field.
        String blank = body(unique("Blank Kiosk"))
                .replace("\"B1\"", "\"\"").replace("\"Beside the lift\"", "\"\"")
                .replace("\"https://example.com/k.jpg\"", "\"\"");
        mvc.perform(post("/api/suppliers").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content(blank))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.floor").doesNotExist())
                .andExpect(jsonPath("$.locationDescription").doesNotExist())
                .andExpect(jsonPath("$.imageUrl").doesNotExist());
    }

    @Test
    void adminsCanPartiallyUpdateAndOthersCannot() throws Exception {
        String id = createAsAdmin(unique("Patch Kiosk"));
        mvc.perform(patch("/api/suppliers/{id}", id).with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingTime\":\"22:30\"}"))
                .andExpect(status().isForbidden());

        mvc.perform(patch("/api/suppliers/{id}", id).with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingTime\":\"22:30\",\"floor\":\"\",\"imageUrl\":\"\",\"type\":\"Food\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.closingTime").value("22:30"))
                .andExpect(jsonPath("$.openingTime").value("08:00"))
                .andExpect(jsonPath("$.type").value("Food"))
                .andExpect(jsonPath("$.floor").doesNotExist())
                .andExpect(jsonPath("$.imageUrl").doesNotExist());

        String rename = unique("Renamed Kiosk");
        mvc.perform(patch("/api/suppliers/{id}", id).with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"" + rename + "\",\"building\":\"Other\",\"floor\":\"2\","
                                + "\"locationDescription\":\"Upstairs\",\"latitude\":1.3,\"longitude\":103.7,"
                                + "\"openingTime\":\"07:00\",\"imageUrl\":\"https://example.com/n.jpg\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(rename))
                .andExpect(jsonPath("$.building").value("Other"));

        mvc.perform(patch("/api/suppliers/{id}", id).with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details[0].field").value("name"));
        mvc.perform(patch("/api/suppliers/{id}", "missing-id").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"Food\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteDeactivatesButKeepsTheRecord(CapturedOutput output) throws Exception {
        String name = unique("Retired Kiosk");
        String id = createAsAdmin(name);

        mvc.perform(delete("/api/suppliers/{id}", id).with(as(STUDENT))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/suppliers/{id}", id).with(as(ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        assertThat(output).contains("\"" + name + "\" deactivated by uid-" + ADMIN);

        // Still retrievable by ID (F6.3.3) but hidden from the default listing (F3.1.1).
        mvc.perform(get("/api/suppliers/{id}", id).with(as(STUDENT))).andExpect(jsonPath("$.active").value(false));
        mvc.perform(get("/api/suppliers").param("q", name).with(as(STUDENT))).andExpect(jsonPath("$.totalItems").value(0));

        // Inactive listings are admin-only.
        mvc.perform(get("/api/suppliers").param("status", "inactive").with(as(STUDENT)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Only administrators can list inactive suppliers."));
        mvc.perform(get("/api/suppliers").param("status", "inactive").param("q", name).with(as(ADMIN)))
                .andExpect(jsonPath("$.items[0].id").value(id));

        // Reactivate through PATCH.
        mvc.perform(patch("/api/suppliers/{id}", id).with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\":true}"))
                .andExpect(jsonPath("$.active").value(true));
    }

    // ---- Service-to-service endpoints (F5) -------------------------------------------

    @Test
    void validatesPickupAndDeliveryPairs(CapturedOutput output) throws Exception {
        String pickup = createAsAdmin(unique("Pickup"));
        String delivery = createAsAdmin(unique("Delivery"));
        String retired = createAsAdmin(unique("Retired"));
        mvc.perform(delete("/api/suppliers/{id}", retired).with(as(ADMIN))).andExpect(status().isOk());

        mvc.perform(post("/api/suppliers/validate").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pickupSupplierId\":\"" + pickup + "\",\"deliverySupplierId\":\"" + delivery + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.problems.length()").value(0));

        mvc.perform(post("/api/suppliers/validate").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pickupSupplierId\":\"missing\",\"deliverySupplierId\":\"" + retired + "\"}"))
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.problems[0].reason").value("NOT_FOUND"))
                .andExpect(jsonPath("$.problems[1].reason").value("INACTIVE"));
        assertThat(output).contains("Rejected pickup/delivery pair: [pickupSupplierId missing NOT_FOUND, "
                + "deliverySupplierId " + retired + " INACTIVE]");

        mvc.perform(post("/api/suppliers/validate").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pickupSupplierId\":\"\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void resolvesStatusAndBatchesOfIds() throws Exception {
        String id = createAsAdmin(unique("Lookup Kiosk"));
        mvc.perform(get("/api/suppliers/{id}/status", id).with(as(STUDENT)))
                .andExpect(jsonPath("$.exists").value(true))
                .andExpect(jsonPath("$.active").value(true));
        mvc.perform(get("/api/suppliers/{id}/status", "missing").with(as(STUDENT)))
                .andExpect(jsonPath("$.exists").value(false));

        mvc.perform(post("/api/suppliers/lookup").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + id + "\",\"missing\",\"missing\"]}"))
                .andExpect(jsonPath("$.items[0].id").value(id))
                .andExpect(jsonPath("$.missingIds.length()").value(1))
                .andExpect(jsonPath("$.missingIds[0]").value("missing"));
        mvc.perform(post("/api/suppliers/lookup").with(as(STUDENT)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[]}"))
                .andExpect(status().isBadRequest());
    }

    // ---- Unsupported requests ---------------------------------------------------------

    @Test
    void unknownRoutesAndMethodsUseTheErrorEnvelope() throws Exception {
        mvc.perform(get("/api/suppliers/a/b/c").with(as(STUDENT)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("NOT_FOUND"));
        mvc.perform(put("/api/suppliers/some-id").with(as(ADMIN)).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.error").value("METHOD_NOT_ALLOWED"));
    }
}
