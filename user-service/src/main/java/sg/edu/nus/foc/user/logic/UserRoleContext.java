package sg.edu.nus.foc.user.logic;

import java.util.List;

public class UserRoleContext {
    private String userId;
    private List<String> roles;
    private boolean isCourierSuspended;

    public UserRoleContext() {}

    public UserRoleContext(String userId, List<String> roles, boolean isCourierSuspended) {
        this.userId = userId;
        this.roles = roles;
        this.isCourierSuspended = isCourierSuspended;
    }

    // Getters
    public String getUserId() {
        return this.userId;
    }

    public List<String> getRoles() {
        return this.roles;
    }

    public boolean getIsCourierSuspended() {
        return this.isCourierSuspended;
    }

    // Setters
    public void setUserId(String newUserId) {
        this.userId = newUserId;
        return;
    }

    public void setRoles(List<String> newRoles) {
        this.roles = newRoles;
        return;
    }

    public void setIsCourierSuspended(boolean newIsCourierSuspended) {
        this.isCourierSuspended = newIsCourierSuspended;
        return;
    }
}