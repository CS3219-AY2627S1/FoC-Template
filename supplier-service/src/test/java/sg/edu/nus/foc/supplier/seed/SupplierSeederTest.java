package sg.edu.nus.foc.supplier.seed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static sg.edu.nus.foc.supplier.support.Suppliers.details;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import sg.edu.nus.foc.supplier.supplier.Supplier;
import sg.edu.nus.foc.supplier.supplier.SupplierDetails;
import sg.edu.nus.foc.supplier.supplier.SupplierService;
import sg.edu.nus.foc.supplier.supplier.SupplierSource;
import sg.edu.nus.foc.supplier.support.InMemorySupplierRepository;

class SupplierSeederTest {

    private static final String HEADER =
            "Name,Type,Building,Floor,Location Description,Latitude,Longitude,StartingTime,ClosingTime,ImageURL\n";
    private static final String COOL_SPOT = "Cool Spot,Food,Com2,1,Opp LT16,1.294,103.7738,0900hrs,2130hrs,\n";
    private static final String PRINTER = "Printer @ Com 2,Printing,Com 2,1,Next to LT19,1.2938,103.7744,0000hrs,2359hrs,\n";

    @TempDir
    Path dir;

    private InMemorySupplierRepository repository;
    private SupplierSeeder seeder;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-09-25T04:00:00Z"), ZoneOffset.UTC);
        repository = new InMemorySupplierRepository(clock);
        SupplierProperties properties = new SupplierProperties(null, null, null, null, Duration.ofSeconds(60), null);
        seeder = new SupplierSeeder(repository, new SupplierService(repository, clock, properties), properties);
    }

    private Path csv(String rows) throws IOException {
        Path file = dir.resolve("seed-" + System.nanoTime() + ".csv");
        Files.writeString(file, HEADER + rows);
        return file;
    }

    @Test
    void firstLoadCreatesActiveSeedRecords() throws IOException {
        SeedReport report = seeder.seed(csv(COOL_SPOT + PRINTER));
        assertThat(report).isEqualTo(new SeedReport(2, 0, 0, 0, 0, 0));
        assertThat(repository.findAll()).allSatisfy(s -> {
            assertThat(s.active()).isTrue();
            assertThat(s.source()).isEqualTo(SupplierSource.SEED);
        });
    }

    @Test
    void reloadingTheSameFileChangesNothing() throws IOException {
        Path file = csv(COOL_SPOT + PRINTER);
        seeder.seed(file);
        assertThat(seeder.seed(file)).isEqualTo(new SeedReport(0, 0, 2, 0, 0, 0));
        assertThat(repository.findAll()).hasSize(2);
    }

    @Test
    void changedRowUpdatesTheExistingRecordKeepingItsId() throws IOException {
        seeder.seed(csv(COOL_SPOT));
        String id = repository.findAll().getFirst().id();
        SeedReport report = seeder.seed(csv(COOL_SPOT.replace("2130hrs", "2200hrs")));
        assertThat(report.updated()).isEqualTo(1);
        assertThat(repository.findById(id).orElseThrow().details().closingTime()).hasToString("22:00");
    }

    @Test
    void seedRecordsMissingFromTheFileAreDeactivatedButAdminRecordsAreKept() throws IOException {
        seeder.seed(csv(COOL_SPOT + PRINTER));
        Supplier admin = repository.create(details("Admin Kiosk", "Food", "UTown"), SupplierSource.ADMIN);

        SeedReport report = seeder.seed(csv(COOL_SPOT));
        assertThat(report.deactivated()).isEqualTo(1);
        assertThat(repository.findAll()).hasSize(3);
        assertThat(repository.findAll()).filteredOn(s -> s.details().name().startsWith("Printer"))
                .singleElement().satisfies(s -> assertThat(s.active()).isFalse());
        assertThat(repository.findById(admin.id()).orElseThrow().active()).isTrue();
    }

    @Test
    void reloadDoesNotReactivateAnAdminDeactivation() throws IOException {
        Path file = csv(COOL_SPOT);
        seeder.seed(file);
        Supplier s = repository.findAll().getFirst();
        repository.update(s.id(), d -> d, false);
        seeder.seed(file);
        assertThat(repository.findById(s.id()).orElseThrow().active()).isFalse();
    }

    // ---- Administrators' changes survive reloads (every Cloud Run restart reloads the file) ----------

    private Supplier coolSpot() {
        return repository.findAll().stream().filter(s -> s.details().name().startsWith("Cool Spot"))
                .findFirst().orElseThrow();
    }

    private static SupplierDetails withClosingTime(SupplierDetails d, LocalTime closing) {
        return new SupplierDetails(d.name(), d.type(), d.building(), d.floor(), d.locationDescription(),
                d.latitude(), d.longitude(), d.openingTime(), closing, d.imageUrl());
    }

    private static SupplierDetails renamed(SupplierDetails d, String name) {
        return new SupplierDetails(name, d.type(), d.building(), d.floor(), d.locationDescription(),
                d.latitude(), d.longitude(), d.openingTime(), d.closingTime(), d.imageUrl());
    }

    @Test
    void reloadKeepsAnAdministratorsEditOfASeedRecord() throws IOException {
        Path file = csv(COOL_SPOT);
        seeder.seed(file);
        String id = coolSpot().id();
        repository.update(id, d -> withClosingTime(d, LocalTime.of(23, 0)), null);

        assertThat(seeder.seed(file)).isEqualTo(new SeedReport(0, 0, 0, 1, 0, 0));
        assertThat(repository.findById(id).orElseThrow().details().closingTime()).isEqualTo(LocalTime.of(23, 0));
    }

    @Test
    void reloadAfterAnAdministratorRenamesASeedRecordNeitherDuplicatesNorDeactivatesIt() throws IOException {
        Path file = csv(COOL_SPOT);
        seeder.seed(file);
        String id = coolSpot().id();
        repository.update(id, d -> renamed(d, "Cool Spot Too"), null);

        assertThat(seeder.seed(file)).isEqualTo(new SeedReport(0, 0, 0, 1, 0, 0));
        assertThat(repository.findAll()).singleElement().satisfies(s -> {
            assertThat(s.id()).isEqualTo(id);
            assertThat(s.details().name()).isEqualTo("Cool Spot Too");
            assertThat(s.active()).isTrue();
        });
    }

    @Test
    void seedRecordsAnAdministratorChangedStayActiveWhenTheirRowIsRemoved() throws IOException {
        seeder.seed(csv(COOL_SPOT + PRINTER));
        Supplier printer = repository.findAll().stream()
                .filter(s -> s.details().name().startsWith("Printer")).findFirst().orElseThrow();
        repository.update(printer.id(), d -> withClosingTime(d, LocalTime.of(22, 0)), null);

        SeedReport report = seeder.seed(csv(COOL_SPOT));
        assertThat(report.deactivated()).isZero();
        assertThat(repository.findById(printer.id()).orElseThrow().active()).isTrue();
    }

    @Test
    void rowsMatchingAnAdministratorsSupplierLeaveItUntouched() throws IOException {
        Supplier admin = repository.create(withClosingTime(details("Cool Spot", "Food", "Com2"), LocalTime.of(17, 0)),
                SupplierSource.ADMIN);

        assertThat(seeder.seed(csv(COOL_SPOT))).isEqualTo(new SeedReport(0, 0, 0, 1, 0, 0));
        assertThat(repository.findAll()).containsExactly(admin);
    }

    @Test
    void recordsSeededBeforeSeedKeysExistedAreAdoptedOnce() throws IOException {
        Path file = csv(COOL_SPOT);
        seeder.seed(file);
        Supplier legacy = coolSpot();
        repository.put(new Supplier(legacy.id(), legacy.details(), true, SupplierSource.SEED, null, false,
                legacy.createdAt(), legacy.updatedAt()));

        assertThat(seeder.seed(file).updated()).isEqualTo(1);
        assertThat(repository.findById(legacy.id()).orElseThrow().seedKey()).isEqualTo(legacy.details().naturalKey());
        assertThat(seeder.seed(file)).isEqualTo(new SeedReport(0, 0, 1, 0, 0, 0));
    }

    @Test
    void anAdministratorsEditDuringTheLoadWins() throws IOException {
        seeder.seed(csv(COOL_SPOT));
        String id = coolSpot().id();
        // The administrator saves after the loader has read the catalogue but before it writes.
        InMemorySupplierRepository racing = new InMemorySupplierRepository(Clock.systemUTC()) {
            @Override
            public List<Supplier> findAll() {
                List<Supplier> snapshot = super.findAll();
                update(id, d -> withClosingTime(d, LocalTime.of(20, 0)), null);
                return snapshot;
            }
        };
        repository.findAll().forEach(racing::put);
        SupplierProperties properties = new SupplierProperties(null, null, null, null, null, null);
        SupplierSeeder racingSeeder = new SupplierSeeder(racing,
                new SupplierService(racing, Clock.systemUTC(), properties), properties);

        SeedReport report = racingSeeder.seed(csv(COOL_SPOT.replace("2130hrs", "2200hrs")));
        assertThat(report.preserved()).isEqualTo(1);
        assertThat(racing.findById(id).orElseThrow().details().closingTime()).isEqualTo(LocalTime.of(20, 0));
    }

    @Test
    void invalidAndDuplicateRowsAreSkippedWithoutBlockingOthers() throws IOException {
        SeedReport report = seeder.seed(csv(COOL_SPOT + ",Food,B,1,,1,1,0900hrs,1800hrs,\n" + COOL_SPOT + PRINTER));
        assertThat(report).isEqualTo(new SeedReport(2, 0, 0, 0, 0, 2));
    }

    @Test
    void idColumnUpdatesThatSupplierAndUnknownIdsAreSkipped() throws IOException {
        seeder.seed(csv(COOL_SPOT));
        String id = repository.findAll().getFirst().id();
        String idHeader = "Id," + HEADER;
        Path file = dir.resolve("with-ids.csv");
        Files.writeString(file, idHeader
                + id + ",Cool Spot Renamed,Food,Com2,1,Opp LT16,1.294,103.7738,0900hrs,2130hrs,\n"
                + "unknown,Ghost,Food,Com2,1,,1,1,0900hrs,2130hrs,\n");
        SeedReport report = seeder.seed(file);
        assertThat(report.updated()).isEqualTo(1);
        assertThat(report.skipped()).isEqualTo(1);
        assertThat(repository.findById(id).orElseThrow().details().name()).isEqualTo("Cool Spot Renamed");
    }

    @Test
    void renameOntoAnotherSupplierIsSkipped() throws IOException {
        seeder.seed(csv(COOL_SPOT + PRINTER));
        String printerId = repository.findAll().stream()
                .filter(s -> s.details().name().startsWith("Printer")).findFirst().orElseThrow().id();
        Path file = dir.resolve("clash.csv");
        Files.writeString(file, "Id," + HEADER + printerId + "," + COOL_SPOT);
        assertThat(seeder.seed(file).skipped()).isEqualTo(1);
    }

    @Test
    void startupWithoutSeedFileDoesNothingAndBrokenFileFailsStartup() {
        seeder.afterSingletonsInstantiated();
        assertThat(repository.findAll()).isEmpty();

        SupplierProperties broken = new SupplierProperties(null, null, null, dir.resolve("missing.csv").toString(),
                null, null);
        Clock clock = Clock.systemUTC();
        SupplierSeeder failing = new SupplierSeeder(repository, new SupplierService(repository, clock, broken), broken);
        assertThatThrownBy(failing::afterSingletonsInstantiated).isInstanceOf(SeedFileException.class);
    }
}
