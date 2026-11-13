package sg.edu.nus.foc.order.security.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class UserRoleContextResponse {
    private String userId;
    private List<String> roles;
    @JsonProperty("isCourierSuspended")
    private Boolean courierSuspended;

    public UserRoleContextResponse(String userId, List<String> roles) {
        this(userId, roles, null);
    }
}
