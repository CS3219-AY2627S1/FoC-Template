package sg.edu.nus.foc.user.logic;

public class AdminEligibility {
    private boolean isAdminEligibile;

    public AdminEligibility() {}
    
    public AdminEligibility(boolean isAdminEligibile) {
        this.isAdminEligibile = isAdminEligibile;
    }

    // Getter
    public boolean getIsAdminEligibile() {
        return this.isAdminEligibile;
    }

    // Setter
    public void setIsAdminEligibile(boolean isAdminEligibile) {
        this.isAdminEligibile = isAdminEligibile;
        return;
    }
}
