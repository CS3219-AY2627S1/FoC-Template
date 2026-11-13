package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static sg.edu.nus.foc.supplier.support.Suppliers.details;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.UnaryOperator;

import com.google.cloud.firestore.FieldValue;
import com.google.cloud.firestore.Firestore;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.supplier.support.FirestoreEmulator;

class FirestoreSupplierRepositoryIntegrationTest {

    private static final String DATABASE = "repository-test";
    private static Firestore firestore;
    private FirestoreSupplierRepository repository;

    @BeforeAll
    static void connect() {
        firestore = FirestoreEmulator.client(DATABASE);
    }

    @AfterAll
    static void disconnect() throws Exception {
        firestore.close();
    }

    @BeforeEach
    void reset() {
        FirestoreEmulator.clear(DATABASE);
        repository = new FirestoreSupplierRepository(firestore,
                Clock.fixed(Instant.parse("2026-09-25T04:00:00Z"), ZoneOffset.UTC));
    }

    @Test
    void createsAndReadsBackEveryField() {
        SupplierDetails d = new SupplierDetails("Anna's x Soup Union", "Food", "Central Library", "1",
                "Next to NUS Co-op", 1.296444, 103.773032, java.time.LocalTime.of(9, 0),
                java.time.LocalTime.of(18, 0), "https://example.com/anna.jpeg");
        Supplier created = repository.create(d, SupplierSource.SEED);

        Supplier read = repository.findById(created.id()).orElseThrow();
        assertThat(read).isEqualTo(created);
        assertThat(read.details()).isEqualTo(d);
        assertThat(read.active()).isTrue();
        assertThat(read.createdAt()).isEqualTo(Instant.parse("2026-09-25T04:00:00Z"));
        assertThat(repository.findAll()).containsExactly(created);
        assertThat(repository.findByNaturalKey(d.naturalKey())).contains(created);
    }

    @Test
    void rejectsDuplicateNameAndBuilding() {
        Supplier first = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.ADMIN);
        assertThatThrownBy(() -> repository.create(details("COOL SPOT", "Food", "com2"), SupplierSource.ADMIN))
                .isInstanceOf(DuplicateSupplierException.class)
                .satisfies(e -> assertThat(((DuplicateSupplierException) e).existingSupplierId()).isEqualTo(first.id()));
    }

    @Test
    void updateKeepsIdAndSourceAndMovesTheUniquenessKey() {
        Supplier created = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        Supplier renamed = repository.update(created.id(), d -> details("Cool Spot 2", "Food", "Com2"), false);

        assertThat(renamed.id()).isEqualTo(created.id());
        assertThat(renamed.source()).isEqualTo(SupplierSource.SEED);
        assertThat(renamed.active()).isFalse();
        assertThat(repository.findByNaturalKey(NaturalKey.of("Cool Spot", "Com2"))).isEmpty();
        assertThat(repository.findByNaturalKey(NaturalKey.of("Cool Spot 2", "Com2"))).contains(renamed);
        // The old name is free again.
        assertThat(repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.ADMIN).id())
                .isNotEqualTo(created.id());
    }

    @Test
    void updateWithoutRenameKeepsKey() {
        Supplier created = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        repository.update(created.id(), d -> details("Cool Spot", "Food/Coffee", "Com2"), null);
        assertThat(repository.findByNaturalKey(created.details().naturalKey()).orElseThrow().details().type())
                .isEqualTo("Food/Coffee");
    }

    @Test
    void updateRejectsRenameOntoAnotherSupplier() {
        repository.create(details("A", "Food", "Com2"), SupplierSource.ADMIN);
        Supplier b = repository.create(details("B", "Food", "Com2"), SupplierSource.ADMIN);
        assertThatThrownBy(() -> repository.update(b.id(), d -> details("a", "Food", "Com2"), true))
                .isInstanceOf(DuplicateSupplierException.class);
    }

    @Test
    void updateOfUnknownOrInvalidIdIsNotFound() {
        assertThatThrownBy(() -> repository.update("missing", d -> details("A", "Food", "Com2"), true))
                .isInstanceOf(SupplierNotFoundException.class);
        assertThatThrownBy(() -> repository.update("a/b", d -> details("A", "Food", "Com2"), true))
                .isInstanceOf(SupplierNotFoundException.class);
    }

    @Test
    void seedRecordsRememberTheirRowAndAdminRecordsDoNot() {
        Supplier seeded = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        Supplier admin = repository.create(details("Kiosk", "Food", "Com2"), SupplierSource.ADMIN);

        assertThat(repository.findById(seeded.id()).orElseThrow().seedKey()).isEqualTo(NaturalKey.of("Cool Spot", "Com2"));
        assertThat(repository.findById(seeded.id()).orElseThrow().managedBySeed()).isTrue();
        assertThat(repository.findById(admin.id()).orElseThrow().seedKey()).isNull();
        assertThat(repository.findById(admin.id()).orElseThrow().managedBySeed()).isFalse();
    }

    @Test
    void adminEditsMarkTheRecordSoTheSeedLoaderLeavesItAlone() {
        Supplier seeded = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        Supplier edited = repository.update(seeded.id(), d -> details("Cool Spot 2", "Food", "Com2"), null);

        assertThat(edited.adminModified()).isTrue();
        assertThat(edited.active()).isTrue();
        assertThat(edited.seedKey()).isEqualTo(seeded.seedKey());
        assertThat(repository.updateFromSeed(seeded.id(), details("Cool Spot", "Food", "Com2"))).isEmpty();
        assertThat(repository.deactivateFromSeed(seeded.id())).isEmpty();
        assertThat(repository.findById(seeded.id()).orElseThrow()).isEqualTo(edited);
    }

    @Test
    void seedLoaderUpdatesAndDeactivatesTheRecordsItManages() {
        Supplier seeded = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);

        Supplier updated = repository.updateFromSeed(seeded.id(), details("Cool Spot", "Food/Coffee", "Com2"))
                .orElseThrow();
        assertThat(updated.details().type()).isEqualTo("Food/Coffee");
        assertThat(updated.managedBySeed()).isTrue();

        assertThat(repository.deactivateFromSeed(seeded.id())).hasValueSatisfying(s -> assertThat(s.active()).isFalse());
        assertThat(repository.deactivateFromSeed(seeded.id())).isEmpty();
        assertThatThrownBy(() -> repository.deactivateFromSeed("missing")).isInstanceOf(SupplierNotFoundException.class);
    }

    @Test
    void readsRecordsWrittenBeforeSeedKeysExisted() throws Exception {
        Supplier seeded = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        firestore.collection(FirestoreSupplierRepository.SUPPLIERS).document(seeded.id())
                .update("seedKey", FieldValue.delete(), "adminModified", FieldValue.delete()).get();

        Supplier legacy = repository.findById(seeded.id()).orElseThrow();
        assertThat(legacy.seedKey()).isNull();
        assertThat(legacy.adminModified()).isFalse();
        assertThat(legacy.managedBySeed()).isTrue();
    }

    @Test
    void concurrentEditsOfDifferentFieldsAreAllKept() throws Exception {
        Supplier created = repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.ADMIN);
        List<UnaryOperator<SupplierDetails>> edits = List.of(
                d -> new SupplierDetails(d.name(), "Food/Coffee", d.building(), d.floor(), d.locationDescription(),
                        d.latitude(), d.longitude(), d.openingTime(), d.closingTime(), d.imageUrl()),
                d -> new SupplierDetails(d.name(), d.type(), d.building(), "B2", d.locationDescription(),
                        d.latitude(), d.longitude(), d.openingTime(), d.closingTime(), d.imageUrl()),
                d -> new SupplierDetails(d.name(), d.type(), d.building(), d.floor(), "Opposite LT16",
                        d.latitude(), d.longitude(), d.openingTime(), d.closingTime(), d.imageUrl()),
                d -> new SupplierDetails(d.name(), d.type(), d.building(), d.floor(), d.locationDescription(),
                        d.latitude(), d.longitude(), d.openingTime(), LocalTime.of(23, 0), d.imageUrl()));

        try (ExecutorService pool = Executors.newFixedThreadPool(edits.size())) {
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Supplier>> results = edits.stream()
                    .map(edit -> pool.submit(() -> {
                        start.await();
                        return repository.update(created.id(), edit, null);
                    }))
                    .toList();
            start.countDown();
            for (Future<Supplier> result : results) {
                result.get(60, TimeUnit.SECONDS);
            }
        }

        SupplierDetails merged = repository.findById(created.id()).orElseThrow().details();
        assertThat(merged.type()).isEqualTo("Food/Coffee");
        assertThat(merged.floor()).isEqualTo("B2");
        assertThat(merged.locationDescription()).isEqualTo("Opposite LT16");
        assertThat(merged.closingTime()).isEqualTo(LocalTime.of(23, 0));
    }

    @Test
    void findAllByIdSkipsUnknownAndInvalidIds() {
        Supplier a = repository.create(details("A", "Food", "Com2"), SupplierSource.ADMIN);
        assertThat(repository.findAllById(List.of(a.id(), "missing", "a/b", "..", "__x__", " ")))
                .containsExactly(a);
        assertThat(repository.findAllById(List.of("a/b"))).isEmpty();
        assertThat(repository.findById("..")).isEmpty();
        assertThat(repository.findById(null)).isEmpty();
    }
}
