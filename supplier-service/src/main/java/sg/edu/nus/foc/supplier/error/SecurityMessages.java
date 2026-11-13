package sg.edu.nus.foc.supplier.error;

import jakarta.servlet.http.HttpServletRequest;

/** User-facing wording for authentication and authorisation failures. */
public final class SecurityMessages {

    public static final String UNAUTHENTICATED =
            "Sign in to continue: a valid Firebase ID token is required in the Authorization header.";

    private SecurityMessages() {
    }

    public static String forbidden(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        boolean management = !"GET".equals(method) && !path.endsWith("/validate") && !path.endsWith("/lookup");
        return management
                ? "Only administrators can manage suppliers."
                : "You do not have permission to view this resource.";
    }
}
