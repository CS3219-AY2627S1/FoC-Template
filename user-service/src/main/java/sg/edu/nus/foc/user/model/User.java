package sg.edu.nus.foc.user.model;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;

@Document("users")
public class User {

    @Id
    private String id;

    private String username;
    
    @Indexed(unique = true)
    private String userId;

    private String email;

    private List<String> roles;
    private int penalty = 0;
    private boolean isCourierSuspended = false;
    private Instant suspensionEndDate;
    private boolean isPermanentlySuspended = false;

    private AccountStatus status = AccountStatus.ACTIVE;
    private String deletionOperationId;
    private boolean deletionCanRestore;

    public String getDeletionOperationId() {
        return deletionOperationId;
    }

    public boolean isDeletionCanRestore() {
        return deletionCanRestore;
    }

    public User() {
    }

    // Getters
    public String getId() {
        return this.id;
    }

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

    public boolean getIsPermanentlySuspended() {
        return this.isPermanentlySuspended;
    }

    public AccountStatus getStatus() {
        return status;
    }

    // Setters
    public void setId(String newId) {
        this.id = newId;
        return;
    }

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

    // This allows roles list to be modified, while still ensuring immutability
    public void setRoles(List<String> roles) {
        this.roles = roles == null ? null : List.copyOf(roles);
    }

    public void setPenalty(int newPenalty) {
        this.penalty = newPenalty;
        return;
    }

    public void setIsCourierSuspended(boolean isCourierSuspended) {
        this.isCourierSuspended = isCourierSuspended;
        return;
    }

    public void setSuspensionEndDate(Instant newSuspensionEndDate) {
        this.suspensionEndDate = newSuspensionEndDate;
        return;
    }

    public void setIsPermanentlySuspended(boolean isPermanentlySuspended) {
        this.isPermanentlySuspended = isPermanentlySuspended;
        return;
    }

    public void setStatus(AccountStatus status) {
        this.status = status;
    }
}
