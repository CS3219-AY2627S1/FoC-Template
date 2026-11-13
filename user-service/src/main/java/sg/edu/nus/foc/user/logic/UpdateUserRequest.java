package sg.edu.nus.foc.user.logic;

public class UpdateUserRequest {
    private String userId;
    private String email;
    private String username;

    public UpdateUserRequest() {}

    public UpdateUserRequest(String email, String username) {
        this.email = email;
        this.username = username;
    }

    // Getter
    public String getEmail() {
        return this.email;
    }

    public String getUsername() {
        return this.username;
    }

    // Setter
    public void setEmail(String email) {
        this.email = email;
        return;
    }

    public void setUsername(String username) {
        this.username = username;
        return;
    }
}
