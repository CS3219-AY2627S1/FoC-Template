package sg.edu.nus.foc.user.logic;

import java.util.List;
import java.time.Instant;

public class UserSummary {
    private String username;
    private String userId;
    private String email;
    private List<String> roles;
    private int penalty;
    private boolean isCourierSuspended = false;
    private Instant suspensionEndDate;

    public UserSummary() {}

    public UserSummary(
        String username,
        String userId, 
        String email,
        List<String> roles,
        int penalty,
        boolean isCourierSuspended,
        Instant suspensionEndDate) {

        this.username = username;
        this.userId = userId;
        this.email = email;
        this.roles = roles;
        this.penalty = penalty;
        this.isCourierSuspended = isCourierSuspended;
        this.suspensionEndDate = suspensionEndDate;
    }

    // getters
    public String getUsername() {
        return this.username;
    }

    public String getUserId() {
        return this.userId;
    }

    public String getEmail() {
        return this.email;
    }

    public List<String> getRoles() {
        return this.roles;
    }

    public int getPenalty() {
        return this.penalty;
    }

    public boolean getIsCourierSuspended() {
        return this.isCourierSuspended;
    }

    public Instant getSuspensionEndDate() {
        return this.suspensionEndDate;
    }

    //setters
    public void setUsername(String newUsername) {
        this.username = newUsername;
        return;
    }

    public void setUserId(String newUserId) {
        this.userId = newUserId;
        return;
    }

    public void setEmail(String newEmail) {
        this.email = newEmail;
        return;
    }

    public void setRoles(List<String> newRoles) {
        this.roles = newRoles;
        return;
    }

    public void setPenalty(int newPenalty) {
        this.penalty = newPenalty;
        return;
    }

    public void setIsCourierSuspended(boolean newIsCourierSuspended) {
        this.isCourierSuspended = newIsCourierSuspended;
        return;
    }

    public void setSuspensionEndDate(Instant newSuspensionEndDate) {
        this.suspensionEndDate = newSuspensionEndDate;
        return;
    }
}
