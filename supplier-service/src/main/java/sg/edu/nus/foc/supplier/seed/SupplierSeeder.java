package sg.edu.nus.foc.supplier.seed;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.stereotype.Component;
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import sg.edu.nus.foc.supplier.supplier.DuplicateSupplierException;
import sg.edu.nus.foc.supplier.supplier.Supplier;
import sg.edu.nus.foc.supplier.supplier.SupplierRepository;
import sg.edu.nus.foc.supplier.supplier.SupplierService;
import sg.edu.nus.foc.supplier.supplier.SupplierSource;

/**
 * Loads the supplier catalogue from {@code SUPPLIER_SEED_FILE} at startup (F2).
 *
 * <p>Runs once all beans exist but before the web server starts, so no request is served
 * before the catalogue is loaded (F2.2.1). A missing or malformed file aborts startup (F2.2.2).
 * The load is idempotent: re-running it with the same file changes nothing (F2.3.2).
 *
 * <p>The loader only changes records it created and no administrator has changed since
 * ({@link Supplier#managedBySeed()}). Cloud Run restarts the service often, so without this rule every
 * restart would undo administrators' edits.
 */
@Component
public class SupplierSeeder implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(SupplierSeeder.class);

    private final SupplierRepository repository;
    private final SupplierService service;
    private final SupplierProperties properties;
    private final SeedCsvReader reader = new SeedCsvReader();

    public SupplierSeeder(SupplierRepository repository, SupplierService service, SupplierProperties properties) {
        this.repository = repository;
        this.service = service;
        this.properties = properties;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (properties.seedFile().isEmpty()) {
            log.info("SUPPLIER_SEED_FILE not set; skipping supplier seeding");
            return;
        }
        seed(Path.of(properties.seedFile()));
    }

    public SeedReport seed(Path file) {
        SeedFile parsed = reader.read(file);
        int created = 0;
        int updated = 0;
        int unchanged = 0;
        int preserved = 0;
        int skipped = 0;

        for (SeedRowError error : parsed.errors()) {
            log.warn("Skipped seed row {}: {}", error.rowNumber(), error.reason());
            skipped++;
        }

        List<Supplier> existing = repository.findAll();
        Catalogue catalogue = new Catalogue(existing);
        Set<String> keysInFile = new HashSet<>();
        Set<String> touchedIds = new HashSet<>();
        for (SeedRow row : parsed.rows()) {
            String key = row.details().naturalKey();
            if (!keysInFile.add(key)) {
                log.warn("Skipped seed row {}: duplicate of an earlier row (same name and building)", row.rowNumber());
                skipped++;
                continue;
            }
            Optional<Supplier> match = catalogue.recordFor(row, key);
            if (row.id() != null && match.isEmpty()) {
                log.warn("Skipped seed row {}: unknown supplier ID {}", row.rowNumber(), row.id());
                skipped++;
                continue;
            }
            try {
                if (match.isEmpty()) {
                    touchedIds.add(repository.create(row.details(), SupplierSource.SEED).id());
                    created++;
                    continue;
                }
                Supplier current = match.get();
                touchedIds.add(current.id());
                if (!current.managedBySeed()) {
                    log.info("Kept seed row {}: supplier {} is managed by an administrator", row.rowNumber(),
                            current.id());
                    preserved++;
                } else if (current.details().equals(row.details()) && key.equals(current.seedKey())) {
                    unchanged++;
                } else if (repository.updateFromSeed(current.id(), row.details()).isPresent()) {
                    updated++;
                } else {
                    // An administrator changed it while the file was loading.
                    preserved++;
                }
            } catch (DuplicateSupplierException e) {
                log.warn("Skipped seed row {}: {}", row.rowNumber(), e.getMessage());
                skipped++;
            }
        }

        // F2.4: seed records no longer in the file are deactivated, never deleted. Records an administrator
        // created or changed are left alone so a restart cannot undo their work.
        int deactivated = 0;
        for (Supplier supplier : existing) {
            if (supplier.managedBySeed() && supplier.active() && !touchedIds.contains(supplier.id())
                    && repository.deactivateFromSeed(supplier.id()).isPresent()) {
                deactivated++;
            }
        }
        service.invalidateCache();

        SeedReport report = new SeedReport(created, updated, unchanged, preserved, deactivated, skipped);
        log.info("Supplier seed {}: {} created, {} updated, {} unchanged, {} kept (administrator-managed), "
                        + "{} deactivated, {} skipped",
                file.getFileName(), report.created(), report.updated(), report.unchanged(), report.preserved(),
                report.deactivated(), report.skipped());
        return report;
    }

    /** The catalogue as it was when the load started, indexed the ways a seed row can identify a record. */
    private static final class Catalogue {

        private final Map<String, Supplier> byId;
        private final Map<String, Supplier> bySeedKey;
        private final Map<String, Supplier> byNaturalKey;

        Catalogue(List<Supplier> suppliers) {
            byId = index(suppliers.stream(), Supplier::id);
            bySeedKey = index(suppliers.stream().filter(s -> s.seedKey() != null), Supplier::seedKey);
            byNaturalKey = index(suppliers.stream(), s -> s.details().naturalKey());
        }

        /**
         * The record a row describes: the one named by its {@code Id} column; else the one this row created,
         * even if an administrator has renamed it since; else whichever record has the row's name and building
         * (records seeded before seed keys existed, or ones an administrator created).
         */
        Optional<Supplier> recordFor(SeedRow row, String key) {
            if (row.id() != null) {
                return Optional.ofNullable(byId.get(row.id()));
            }
            Supplier seeded = bySeedKey.get(key);
            return Optional.ofNullable(seeded != null ? seeded : byNaturalKey.get(key));
        }

        private static Map<String, Supplier> index(Stream<Supplier> suppliers, Function<Supplier, String> key) {
            return suppliers.collect(Collectors.toMap(key, Function.identity(), (first, second) -> first));
        }
    }
}
