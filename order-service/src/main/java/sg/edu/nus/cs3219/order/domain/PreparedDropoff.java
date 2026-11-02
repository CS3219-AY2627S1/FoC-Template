package sg.edu.nus.cs3219.order.domain;

public record PreparedDropoff(
        Long existingId,
        String name,
        String building,
        String description,
        double latitude,
        double longitude
) {
    public boolean isExisting() {
        return existingId != null;
    }
}
