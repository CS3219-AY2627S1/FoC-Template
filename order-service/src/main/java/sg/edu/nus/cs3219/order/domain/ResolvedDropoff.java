package sg.edu.nus.cs3219.order.domain;

public record ResolvedDropoff(
        long id,
        String name,
        String building,
        String description,
        double latitude,
        double longitude
) {
}
