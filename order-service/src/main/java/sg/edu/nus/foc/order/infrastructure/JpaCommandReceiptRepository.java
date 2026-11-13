package sg.edu.nus.foc.order.infrastructure;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import sg.edu.nus.foc.order.domain.CommandReceipt;

public interface JpaCommandReceiptRepository extends JpaRepository<CommandReceipt, String> {
    Optional<CommandReceipt> findByOperationAndCommandId(String operation, String commandId);
}
