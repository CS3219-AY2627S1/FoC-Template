package sg.edu.nus.foc.supplier.support;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.UnaryOperator;

import sg.edu.nus.foc.supplier.supplier.DuplicateSupplierException;
import sg.edu.nus.foc.supplier.supplier.Supplier;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;
import sg.edu.nus.foc.supplier.supplier.SupplierNotFoundException;
import sg.edu.nus.foc.supplier.supplier.SupplierRepository;
import sg.edu.nus.foc.supplier.supplier.SupplierSource;

/** Test double with the same uniqueness rules as the Firestore repository. */
public class InMemorySupplierRepository implements SupplierRepository {

    private final Map<String, Supplier> suppliers = new LinkedHashMap<>();
    private final Clock clock;
    private int sequence;
    public int findAllCalls;

    public InMemorySupplierRepository(Clock clock) {
        this.clock = clock;
    }

    /** Stores a record as-is, e.g. one written by an older version of the service. */
    public void put(Supplier supplier) {
        suppliers.put(supplier.id(), supplier);
    }

    @Override
    public List<Supplier> findAll() {
        findAllCalls++;
        return new ArrayList<>(suppliers.values());
    }

    @Override
    public Optional<Supplier> findById(String id) {
        return Optional.ofNullable(suppliers.get(id));
    }

    @Override
    public List<Supplier> findAllById(Collection<String> ids) {
        return ids.stream().distinct().map(suppliers::get).filter(Objects::nonNull).toList();
    }

    @Override
    public Optional<Supplier> findByNaturalKey(String naturalKey) {
        return suppliers.values().stream().filter(s -> s.details().naturalKey().equals(naturalKey)).findFirst();
    }

    @Override
    public Supplier create(SupplierDetails details, SupplierSource source) {
        findByNaturalKey(details.naturalKey()).ifPresent(s -> {
            throw new DuplicateSupplierException(s.id());
        });
        Instant now = clock.instant();
        String seedKey = source == SupplierSource.SEED ? details.naturalKey() : null;
        Supplier supplier = new Supplier("s" + (++sequence), details, true, source, seedKey, false, now, now);
        suppliers.put(supplier.id(), supplier);
        return supplier;
    }

    @Override
    public Supplier update(String id, UnaryOperator<SupplierDetails> change, Boolean active) {
        return modify(id, current -> Optional.of(current.editedByAdmin(change.apply(current.details()),
                active != null ? active : current.active())))
                .orElseThrow();
    }

    @Override
    public Optional<Supplier> updateFromSeed(String id, SupplierDetails details) {
        return modify(id, current -> current.managedBySeed()
                ? Optional.of(current.seededWith(details))
                : Optional.empty());
    }

    @Override
    public Optional<Supplier> deactivateFromSeed(String id) {
        return modify(id, current -> current.managedBySeed() && current.active()
                ? Optional.of(current.deactivatedBySeed())
                : Optional.empty());
    }

    private Optional<Supplier> modify(String id, Function<Supplier, Optional<Supplier>> change) {
        Supplier existing = findById(id).orElseThrow(() -> new SupplierNotFoundException(id));
        Optional<Supplier> changed = change.apply(existing);
        if (changed.isEmpty()) {
            return Optional.empty();
        }
        findByNaturalKey(changed.get().details().naturalKey()).filter(s -> !s.id().equals(id)).ifPresent(s -> {
            throw new DuplicateSupplierException(s.id());
        });
        Supplier updated = changed.get().updatedAt(clock.instant());
        suppliers.put(id, updated);
        return Optional.of(updated);
    }
}
