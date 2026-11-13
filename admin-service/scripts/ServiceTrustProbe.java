import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.*;
import java.util.*;

/** Non-mutating local-cluster trust check. Signing keys stay inside the caller's pod. */
public final class ServiceTrustProbe {
    private static String encode(byte[] value) { return Base64.getUrlEncoder().withoutPadding().encodeToString(value); }
    private static String token(String prefix, String audience) throws Exception {
        if (!Set.of("ADMIN", "CHAT", "CREDIT").contains(prefix)) throw new IllegalArgumentException("Unsupported caller");
        String kid = System.getenv(prefix + "_SERVICE_KEY_ID");
        if (kid == null || !kid.matches("[A-Za-z0-9._-]{1,100}")) throw new IllegalStateException("Missing caller identity");
        long now = Instant.now().getEpochSecond();
        String header = "{\"alg\":\"RS256\",\"typ\":\"JWT\",\"kid\":\"" + kid + "\"}";
        String claims = "{\"iss\":\"foc-service-auth\",\"sub\":\"" + prefix.toLowerCase(Locale.ROOT) + "-service\",\"aud\":\"" + audience
                + "\",\"iat\":" + now + ",\"exp\":" + (now + 60) + ",\"jti\":\"" + UUID.randomUUID() + "\"}";
        String input = encode(header.getBytes(StandardCharsets.UTF_8)) + "." + encode(claims.getBytes(StandardCharsets.UTF_8));
        var key = KeyFactory.getInstance("RSA").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(System.getenv(prefix + "_SERVICE_PRIVATE_KEY"))));
        var signature = Signature.getInstance("SHA256withRSA"); signature.initSign(key); signature.update(input.getBytes(StandardCharsets.US_ASCII));
        return input + "." + encode(signature.sign());
    }
    public static void main(String[] args) throws Exception {
        String prefix = args[0], receiver = args[1];
        String id = "00000000-0000-0000-0000-000000000001";
        boolean operation = args.length>2 && "operation".equals(args[2]);
        String path = switch (receiver) {
            case "chat-service" -> "/internal/chat/orders/" + id + "/report-eligibility?userId=" + id;
            case "admin-service" -> "/internal/admin/cases/" + id + "/access";
            case "user-service" -> "/internal/users/" + id + "/admin-eligibility";
            case "order-service" -> "/internal/orders/orders/" + id + "/evidence";
            case "credit-service" -> "/internal/credits/orders/" + id + "/evidence";
            default -> throw new IllegalArgumentException("Unsupported receiver");
        };
        if(operation)path=switch(receiver){case "user-service"->"/internal/users/admin-operations/"+id;case "credit-service"->"/internal/credits/admin-operations/"+id;default->throw new IllegalArgumentException("Unsupported operation owner");};
        int port = switch(receiver) {case "user-service" -> 8081; case "order-service" -> 8082; case "credit-service" -> 8083; case "admin-service" -> 8084; default -> 8085;};
        int expected = operation?404:switch(receiver) {case "chat-service", "admin-service" -> 400; case "credit-service" -> 200; default -> 404;};
        URI uri = URI.create("http://" + receiver + ".foc-local.svc.cluster.local.:" + port + path);
        var http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build();
        for (boolean wrongAudience : new boolean[]{true, false}) {
            String assertion = token(prefix, wrongAudience ? receiver + "-wrong" : receiver);
            var response = http.send(HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8)).header("Authorization", "Bearer " + assertion).GET().build(), HttpResponse.BodyHandlers.discarding());
            int required = wrongAudience ? 401 : expected;
            System.out.println(prefix + " -> " + receiver + " wrongAudience=" + wrongAudience + " status=" + response.statusCode() + " expected=" + required);
            if (response.statusCode() != required) throw new IllegalStateException("Unexpected trust/route response; no business acceptance is established");
        }
        // Missing actor/query inputs or an unknown diagnostic UUID never establish domain eligibility.
    }
}
