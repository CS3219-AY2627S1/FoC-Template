package sg.edu.nus.foc.user.logic;

// Only username is passed, other info is taken from token
public class AddUserRequest {
    private String username;

    public AddUserRequest() {}

    public AddUserRequest(String username) {
        this.username = username;
    }

    // Getter
    public String getUsername() {
        return this.username;
    }

    // Setter
    public void setUsername(String newUsername) {
        this.username = newUsername;
        return;
    }
}