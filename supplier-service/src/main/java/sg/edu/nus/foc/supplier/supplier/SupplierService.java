package sg.edu.nus.foc.supplier.supplier;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.function.UnaryOperator;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import sg.edu.nus.foc.supplier.supplier.PairValidation.Problem;
import sg.edu.nus.foc.supplier.supplier.PairValidation.Reason;

@Service
public class SupplierService {

    private final SupplierRepository repository;
    private final Clock clock;
    private final Duration cacheTtl;

    /** Whole catalogue, refreshed at most every {@code cacheTtl} (NFR5.3.2) and on every local write. */
    private volatile CachedCatalogue cache;

    private record CachedCatalogue(List<Supplier> suppliers, Instant loadedAt) {
    }

    public SupplierService(SupplierRepository repository, Clock clock, SupplierProperties properties) {
        this.repository = repository;
        this.clock = clock;
        this.cacheTtl = properties.cacheTtl();
    }

    public PageResult<SupplierMatch> search(CatalogueQuery query) {
        return CatalogueSearch.search(catalogue(), query, campusTime());
    }

    /** Distinct types of active suppliers, for filter drop-downs. */
    public List<String> types() {
        return catalogue().stream()
                .filter(Supplier::active)
                .map(s -> s.details().type())
                .distinct()
                .sorted(String.CASE_INSENSITIVE_ORDER)
                .toList();
    }

    /** Reads through to the database so other services always see current values (F5.2.2). */
    public Supplier get(String id) {
        return repository.findById(id).orElseThrow(() -> new SupplierNotFoundException(id));
    }

    public List<Supplier> lookup(Collection<String> ids) {
        return repository.findAllById(ids);
    }

    public boolean isOpenNow(Supplier supplier) {
        return OpeningHours.isOpen(supplier.details().openingTime(), supplier.details().closingTime(), campusTime());
    }

    public Supplier create(SupplierDetails details) {
        Supplier created = repository.create(details, SupplierSource.ADMIN);
        invalidateCache();
        return created;
    }

    /**
     * An administrator's edit (F6.2). {@code change} is applied to the current details inside the write
     * transaction, so concurrent edits of different fields are not lost.
     *
     * @param active the new active flag, or {@code null} to keep it
     */
    public Supplier update(String id, UnaryOperator<SupplierDetails> change, Boolean active) {
        Supplier updated = repository.update(id, change, active);
        invalidateCache();
        return updated;
    }

    /** Soft delete (F6.3): the record stays retrievable by ID but is no longer selectable. */
    public Supplier deactivate(String id) {
        Supplier current = get(id);
        return current.active() ? update(id, UnaryOperator.identity(), false) : current;
    }

    /** F5.1: both suppliers must exist, be active and be different. */
    public PairValidation validatePair(String pickupId, String deliveryId) {
        Map<String, Supplier> found = repository.findAllById(List.of(pickupId, deliveryId)).stream()
                .collect(Collectors.toMap(Supplier::id, Function.identity()));

        List<Problem> problems = new ArrayList<>();
        check("pickupSupplierId", pickupId, found, problems);
        check("deliverySupplierId", deliveryId, found, problems);
        if (pickupId.equals(deliveryId)) {
            problems.add(new Problem("deliverySupplierId", deliveryId, Reason.SAME_SUPPLIER));
        }
        return new PairValidation(problems.isEmpty(), problems);
    }

    private static void check(String field, String id, Map<String, Supplier> found, List<Problem> problems) {
        Supplier supplier = found.get(id);
        if (supplier == null) {
            problems.add(new Problem(field, id, Reason.NOT_FOUND));
        } else if (!supplier.active()) {
            problems.add(new Problem(field, id, Reason.INACTIVE));
        }
    }

    public void invalidateCache() {
        cache = null;
    }

    List<Supplier> catalogue() {
        CachedCatalogue current = cache;
        Instant now = clock.instant();
        if (current == null || current.loadedAt().plus(cacheTtl).isBefore(now)) {
            List<Supplier> suppliers = repository.findAll().stream()
                    .sorted(Comparator.comparing(Supplier::id))
                    .toList();
            current = new CachedCatalogue(suppliers, now);
            cache = current;
        }
        return current.suppliers();
    }

    private LocalTime campusTime() {
        return LocalTime.now(clock.withZone(OpeningHours.CAMPUS_ZONE));
    }
}
