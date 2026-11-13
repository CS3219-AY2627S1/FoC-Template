package sg.edu.nus.foc.user.logic;

import java.time.Instant;
import java.util.List;
import sg.edu.nus.foc.user.model.AccountStatus;
import sg.edu.nus.foc.user.model.User;

/** Directory display data only; lifecycle recovery fields and Credit balances are not exposed. */
public record AdminUserPage(List<Item> items, int page, int size, long totalItems, long totalPages) {
    public record Item(String id, String userId, String username, String email, List<String> roles,
            int penalty, boolean isCourierSuspended, Instant suspensionEndDate, AccountStatus status) {
        public static Item from(User user) {
            return new Item(user.getId(), user.getUserId(), user.getUsername(), user.getEmail(),
                    user.getRoles() == null ? List.of() : List.copyOf(user.getRoles()), user.getPenalty(),
                    user.getIsCourierSuspended(), user.getSuspensionEndDate(), user.getStatus());
        }
    }
}
