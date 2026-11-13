package com.cs3219.foc.e2e;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.FilePayload;
import com.microsoft.playwright.options.FormData;
import com.microsoft.playwright.options.RequestOptions;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.ComposeContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.QueueAttributeName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
abstract class AbstractEndToEndTest {
    private static volatile ComposeContainer sharedEnvironment;

    private static ComposeContainer composeEnvironment() {
        return new ComposeContainer(Path.of(System.getProperty("foc.root"), "e2e-tests/compose.yaml")
                        .toFile())
                .withBuild(true)
                .withPull(false)
                .withTailChildContainers(true)
                .withExposedService(
                        "api-gateway-1",
                        443,
                        Wait.forHttp("/index.html")
                                .usingTls()
                                .allowInsecure()
                                .withStartupTimeout(Duration.ofMinutes(3)))
                .withExposedService(
                        "user-service-1",
                        8080,
                        Wait.forHttp("/api/actuator/health").withStartupTimeout(Duration.ofMinutes(3)))
                .withExposedService(
                        "credit-service-1",
                        8083,
                        Wait.forHttp("/api/actuator/health").withStartupTimeout(Duration.ofMinutes(3)))
                .withExposedService("postgres-1", 5432)
                .withExposedService("floci-1", 4566)
                .withExposedService("mailpit-1", 8025)
                .withExposedService("toxiproxy-1", 8474);
    }

    /** One stack for every end-to-end class. Each class previously built and started its own. */
    protected static ComposeContainer environment() {
        var existing = sharedEnvironment;
        if (existing != null) return existing;
        synchronized (AbstractEndToEndTest.class) {
            if (sharedEnvironment == null) {
                var created = composeEnvironment();
                created.start();
                sharedEnvironment = created;
                Runtime.getRuntime().addShutdownHook(new Thread(created::stop));
            }
            return sharedEnvironment;
        }
    }

    protected final JsonMapper json = JsonMapper.builder().build();

    @AutoClose
    protected Playwright playwright;

    @AutoClose
    protected SqsClient sqs;

    protected APIRequestContext api;

    @BeforeAll
    void createClients() {
        playwright = Playwright.create();
        sqs = SqsClient.builder()
                .endpointOverride(URI.create("http://" + host("floci", 4566) + ":" + port("floci", 4566)))
                .region(Region.AP_SOUTHEAST_1)
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create("test", "test")))
                .build();
    }

    @BeforeEach
    void createApi() {
        api = playwright
                .request()
                .newContext(
                        new APIRequest.NewContextOptions().setBaseURL(baseUrl()).setIgnoreHTTPSErrors(true));
    }

    @AfterEach
    void closeApi() {
        if (api != null) api.dispose();
    }

    @AfterEach
    void resetRepositories() {
        try {
            awaitMessagingIdle();
        } finally {
            // Cascades include refresh/email tokens, opening hours, reservations and credit audit rows.
            sql("users").execute("TRUNCATE users, event_publication RESTART IDENTITY CASCADE");
            sql("suppliers").execute("TRUNCATE suppliers, event_publication RESTART IDENTITY CASCADE");
            sql("orders").execute("TRUNCATE errands, event_publication RESTART IDENTITY CASCADE");
            sql("credits").execute("TRUNCATE credit_accounts, event_publication RESTART IDENTITY CASCADE");
        }
    }

    protected void awaitMessagingIdle() {
        await().pollInSameThread()
                .during(Duration.ofSeconds(1))
                .atMost(Duration.ofSeconds(30))
                .untilAsserted(() -> {
                    for (var service : List.of("users", "suppliers", "orders", "credits"))
                        assertThat(sql(service).queryForObject("SELECT count(*) FROM event_publication", Long.class))
                                .isZero();
                    for (var service : List.of("credit", "order")) {
                        var input = sqs.getQueueUrl(r -> r.queueName("foc-e2e-" + service + "-events"))
                                .queueUrl();
                        assertThat(sqs.getQueueAttributes(r -> r.queueUrl(input)
                                                .attributeNames(
                                                        QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES,
                                                        QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_NOT_VISIBLE,
                                                        QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES_DELAYED))
                                        .attributes()
                                        .values())
                                .allMatch("0"::equals);
                        var dlq = sqs.getQueueUrl(r -> r.queueName("foc-e2e-" + service + "-dlq"))
                                .queueUrl();
                        assertThat(sqs.getQueueAttributes(r -> r.queueUrl(dlq)
                                                .attributeNames(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES))
                                        .attributes()
                                        .get(QueueAttributeName.APPROXIMATE_NUMBER_OF_MESSAGES))
                                .isEqualTo("0");
                    }
                });
    }

    protected String baseUrl() {
        return "https://" + host("api-gateway", 443) + ":" + port("api-gateway", 443);
    }

    protected String host(String service, int internalPort) {
        return environment().getServiceHost(service + "-1", internalPort);
    }

    protected int port(String service, int internalPort) {
        return environment().getServicePort(service + "-1", internalPort);
    }

    protected JdbcTemplate sql(String service) {
        var database =
                switch (service) {
                    case "users" -> "foc_user";
                    case "suppliers" -> "foc_supplier";
                    case "orders" -> "foc_order";
                    case "credits" -> "foc_credit";
                    default -> throw new IllegalArgumentException("Unknown service database: " + service);
                };
        return new JdbcTemplate(new DriverManagerDataSource(
                "jdbc:postgresql://" + host("postgres", 5432) + ":" + port("postgres", 5432) + "/" + database,
                "test",
                "test"));
    }

    protected JsonNode request(String method, String path, String token, Object body, int expected) {
        var options = RequestOptions.create().setMethod(method);
        if (token != null) options.setHeader("Authorization", "Bearer " + token);
        if (body != null) options.setData(body);
        var response = api.fetch(path, options);
        assertThat(response.status())
                .as("%s %s: %s", method, path, response.text())
                .isEqualTo(expected);
        return response.text().isEmpty() ? null : json.readTree(response.text());
    }

    /** The courier marks the errand delivered, submitting two small PNGs together as proof. */
    protected JsonNode deliver(UUID errand, String token, int expected) {
        var form = FormData.create();
        for (var name : List.of("handover.png", "item.png")) {
            form.append("photos", new FilePayload(name, "image/png", png()));
        }
        var path = "/api/orders/" + errand + "/deliver";
        var response = api.fetch(
                path,
                RequestOptions.create()
                        .setMethod("POST")
                        .setHeader("Authorization", "Bearer " + token)
                        .setMultipart(form));
        assertThat(response.status()).as("POST %s: %s", path, response.text()).isEqualTo(expected);
        return response.text().isEmpty() ? null : json.readTree(response.text());
    }

    // Sends a small PNG as a chat photo, returns the message.
    protected JsonNode sendChatPhoto(UUID errand, String token, int expected) {
        var path = "/api/orders/" + errand + "/messages/attachments";
        var response = api.fetch(
                path,
                RequestOptions.create()
                        .setMethod("POST")
                        .setHeader("Authorization", "Bearer " + token)
                        .setMultipart(FormData.create()
                                .set("id", UUID.randomUUID().toString())
                                .set("file", new FilePayload("photo.png", "image/png", png()))));
        assertThat(response.status()).as("POST %s: %s", path, response.text()).isEqualTo(expected);
        return response.text().isEmpty() ? null : json.readTree(response.text());
    }

    private static byte[] png() {
        var png = new ByteArrayOutputStream();
        try {
            ImageIO.write(new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB), "png", png);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return png.toByteArray();
    }

    protected TestUser register(String name) {
        var email = UUID.randomUUID() + "@u.nus.edu";
        var registered = request(
                "POST",
                "/api/auth/register",
                null,
                Map.of("name", name, "email", email, "password", "Password123!"),
                201);
        request("POST", "/api/auth/email-verification/confirm", null, Map.of("token", verificationToken(email)), 204);
        return new TestUser(UUID.fromString(registered.get("id").asText()), email, login(email));
    }

    protected String login(String email) {
        return request("POST", "/api/auth/login", null, Map.of("email", email, "password", "Password123!"), 200)
                .get("accessToken")
                .asText();
    }

    protected String verificationToken(String email) {
        var mailbox = "http://" + host("mailpit", 8025) + ":" + port("mailpit", 8025);
        return await().pollInSameThread()
                .atMost(Duration.ofSeconds(20))
                .until(
                        () -> {
                            var search = json.readTree(api.get(mailbox + "/api/v1/search?query="
                                            + URLEncoder.encode("to:" + email, StandardCharsets.UTF_8))
                                    .text());
                            var messages = search.path("messages");
                            if (messages.isEmpty()) return null;
                            var message = json.readTree(api.get(mailbox + "/api/v1/message/"
                                            + messages.get(0).get("ID").asText())
                                    .text());
                            var matcher = Pattern.compile("[?&]token=([A-Za-z0-9_-]+)")
                                    .matcher(message.path("Text").asText());
                            return matcher.find() ? matcher.group(1) : null;
                        },
                        Objects::nonNull);
    }

    protected TestUser admin() {
        var user = register("Campus admin");
        sql("users").update("UPDATE users SET roles=ARRAY['ADMIN']::text[] WHERE id=?", user.id());
        return new TestUser(user.id(), user.email(), login(user.email()));
    }

    protected UUID supplier(TestUser admin) {
        return UUID.fromString(request(
                        "POST",
                        "/api/suppliers",
                        admin.token(),
                        Map.of(
                                "name",
                                "Campus food " + UUID.randomUUID(),
                                "category",
                                "FOOD",
                                "building",
                                "COM3",
                                "floor",
                                "1",
                                "locationDescription",
                                "Stall 2",
                                "openingHours",
                                List.of(Map.of("dayOfWeek", "MONDAY", "opensAt", "00:00", "closesAt", "23:59"))),
                        201)
                .get("id")
                .asText());
    }

    protected record TestUser(UUID id, String email, String token) {}
}
