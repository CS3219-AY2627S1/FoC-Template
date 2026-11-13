package sg.edu.nus.foc.order.infrastructure;

import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import sg.edu.nus.foc.order.domain.CommandReceipt;
import sg.edu.nus.foc.order.domain.repository.CommandReceiptRepository;

@Repository
@RequiredArgsConstructor
public class CommandReceiptPersistenceAdapter implements CommandReceiptRepository {
    private final JpaCommandReceiptRepository repository;

    @Override
    public Optional<CommandReceipt> findExisting(
            String operation,
            String commandId) {
        return repository.findByOperationAndCommandId(operation, commandId);
    }

    @Override
    public CommandReceipt save(CommandReceipt receipt) {
        return repository.save(receipt);
    }
}
