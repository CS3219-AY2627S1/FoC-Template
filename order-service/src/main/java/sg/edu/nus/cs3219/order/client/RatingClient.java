package sg.edu.nus.cs3219.order.client;

public interface RatingClient {

    /**
     * Unified average for the user, or null when nobody has rated them yet.
     */
    Double ratingFor(String userId, UserAccount caller);
}
