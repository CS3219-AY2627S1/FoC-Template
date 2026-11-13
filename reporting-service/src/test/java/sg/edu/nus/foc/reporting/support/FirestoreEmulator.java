/*
 * AI Assistance Disclosure:
 * Tool: OpenAI Codex (GPT-5), date: 2026-10-13
 * Mode: Test generation and verification.
 * Scope: Generated automated verification for the team-specified Reporting Service contracts.
 * Author review: I reviewed for correctness
 */
package sg.edu.nus.foc.reporting.support;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.FirestoreOptions;
import org.testcontainers.gcloud.FirestoreEmulatorContainer;
import org.testcontainers.utility.DockerImageName;

public final class FirestoreEmulator {
    public static final String PROJECT = "demo-foc";
    private static final FirestoreEmulatorContainer CONTAINER = new FirestoreEmulatorContainer(
            DockerImageName.parse("gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators"));
    static { CONTAINER.start(); }
    private FirestoreEmulator() { }
    public static Firestore client(String database) {
        return FirestoreOptions.newBuilder().setProjectId(PROJECT).setDatabaseId(database)
                .setEmulatorHost(CONTAINER.getEmulatorEndpoint()).build().getService();
    }
    public static void clear(String database) {
        URI uri = URI.create("http://" + CONTAINER.getEmulatorEndpoint() + "/emulator/v1/projects/" + PROJECT + "/databases/" + database + "/documents");
        try (HttpClient client = HttpClient.newHttpClient()) {
            int status = client.send(HttpRequest.newBuilder(uri).DELETE().build(), HttpResponse.BodyHandlers.discarding()).statusCode();
            if (status != 200) throw new IllegalStateException("Emulator reset failed: " + status);
        } catch (IOException e) { throw new IllegalStateException(e); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
    }
}
