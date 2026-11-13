package sg.edu.nus.foc.order.domain.repository;

import java.util.Optional;
import sg.edu.nus.foc.order.domain.CommandReceipt;

public interface CommandReceiptRepository {
    Optional<CommandReceipt> findExisting(String operation, String commandId);

    CommandReceipt save(CommandReceipt receipt);
}
