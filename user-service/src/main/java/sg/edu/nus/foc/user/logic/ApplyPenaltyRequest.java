package sg.edu.nus.foc.user.logic;

public class ApplyPenaltyRequest {
    private String userId;
    private int penalty;

    public ApplyPenaltyRequest() {}

    public ApplyPenaltyRequest(String userId, int penalty) {
        this.userId = userId;
        this.penalty = penalty;
    }

    // Getter
    public String getUserId() {
        return this.userId;
    }

    public int getPenalty() {
        return this.penalty;
    }

    // Setter
    public void setUserId(String newUserId) {
        this.userId = newUserId;
        return;
    }

    public void setPenalty(int penalty) {
        this.penalty = penalty;
        return;
    }
}
