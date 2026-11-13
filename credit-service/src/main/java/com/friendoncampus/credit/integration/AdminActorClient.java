package com.friendoncampus.credit.integration;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import com.friendoncampus.credit.authorization.CurrentAuthorization;

/** No ledger lock or transaction spans this call. */
@Component
public class AdminActorClient {
    private final CurrentAuthorization current;
    public AdminActorClient(CurrentAuthorization current) { this.current=current; }
    public boolean eligible(UUID actor) {
        try { current.require(actor,"ADMIN");return true; }
        catch(ResponseStatusException ex) {
            if(ex.getStatusCode().value()==403)return false;
            throw new IllegalStateException("Current User authorization unavailable");
        }
    }
}
