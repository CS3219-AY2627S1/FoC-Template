package com.cs3219.foc.e2e;

import static com.microsoft.playwright.assertions.PlaywrightAssertions.assertThat;
import static org.assertj.core.api.Assertions.assertThat;

import com.microsoft.playwright.*;
import com.microsoft.playwright.options.AriaRole;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.*;

class BrowserJourneysTests extends AbstractEndToEndTest {
    @AutoClose
    private Browser browser;

    private BrowserContext context;

    @BeforeAll
    void launchBrowser() {
        browser = playwright.chromium().launch();
    }

    @BeforeEach
    void createBrowserContext() {
        context = browser.newContext(
                new Browser.NewContextOptions().setBaseURL(baseUrl()).setIgnoreHTTPSErrors(true));
        context.tracing().start(new Tracing.StartOptions().setScreenshots(true).setSnapshots(true));
    }

    @AfterEach
    void saveTraceAndClose(TestInfo info) throws Exception {
        if (context != null) {
            try {
                var output = Path.of(System.getProperty("foc.e2e.output"));
                Files.createDirectories(output);
                context.tracing()
                        .stop(new Tracing.StopOptions()
                                .setPath(output.resolve(
                                        info.getTestMethod().orElseThrow().getName() + ".zip")));
            } finally {
                context.close();
            }
        }
    }

    @Test
    void registrationVerificationLoginAndLogoutUseTheRealBackend() {
        var page = context.newPage();
        var email = UUID.randomUUID() + "@u.nus.edu";
        page.navigate("/register");
        page.getByLabel("Name", new Page.GetByLabelOptions().setExact(true)).fill("Browser student");
        page.getByLabel("Email", new Page.GetByLabelOptions().setExact(true)).fill(email);
        page.getByLabel("Password", new Page.GetByLabelOptions().setExact(true)).fill("Password123!");
        page.getByLabel("Confirm password", new Page.GetByLabelOptions().setExact(true))
                .fill("Password123!");
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Create Account"))
                .click();
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Check your email")))
                .isVisible();
        page.navigate("/verify-email?token=" + verificationToken(email));
        assertThat(page.getByRole(AriaRole.HEADING, new Page.GetByRoleOptions().setName("Email verified")))
                .isVisible();
        loginBrowser(page, email);
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Open account for Browser student"))
                .click();
        page.getByRole(AriaRole.MENUITEM, new Page.GetByRoleOptions().setName("Profile"))
                .click();
        assertThat(page).hasURL(Pattern.compile(".*/profile$"));
        assertThat(page.getByText(email, new Page.GetByTextOptions().setExact(true))
                        .first())
                .isVisible();
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Open account for Browser student"))
                .click();
        page.getByRole(AriaRole.MENUITEM, new Page.GetByRoleOptions().setName("Log out"))
                .click();
        assertThat(page).hasURL(Pattern.compile(".*/login$"));
    }

    @Test
    void adminCreatesSupplierThroughTheBrowserAndTheApiReturnsIt() {
        var page = context.newPage();
        var admin = admin();
        loginBrowser(page, admin.email());
        page.navigate("/admin/suppliers/new");
        var name = "Browser supplier " + UUID.randomUUID();
        page.getByLabel(Pattern.compile("^Name")).fill(name);
        page.getByLabel(Pattern.compile("^Building")).fill("COM3");
        page.getByLabel("Floor").fill("1");
        page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Add Supplier"))
                .click();
        assertThat(page).hasURL(Pattern.compile(".*/admin/suppliers(?:\\?.*)?$"));
        assertThat(page.getByText(name, new Page.GetByTextOptions().setExact(true)))
                .isVisible();
        var suppliers = request(
                "GET", "/api/suppliers?q=" + URLEncoder.encode(name, StandardCharsets.UTF_8), admin.token(), null, 200);
        assertThat(suppliers.toString()).contains(name);
    }

    private void loginBrowser(Page page, String email) {
        page.navigate("/login");
        page.getByLabel("Email", new Page.GetByLabelOptions().setExact(true)).fill(email);
        page.getByLabel("Password", new Page.GetByLabelOptions().setExact(true)).fill("Password123!");
        page.getByRole(
                        AriaRole.BUTTON,
                        new Page.GetByRoleOptions().setName("Log In").setExact(true))
                .click();
        assertThat(page).not().hasURL(Pattern.compile(".*/login$"));
    }
}
