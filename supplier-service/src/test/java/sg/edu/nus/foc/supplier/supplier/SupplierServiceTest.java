package sg.edu.nus.foc.supplier.supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static sg.edu.nus.foc.supplier.support.Suppliers.details;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import sg.edu.nus.foc.supplier.config.SupplierProperties;
import sg.edu.nus.foc.supplier.supplier.PairValidation.Reason;
import sg.edu.nus.foc.supplier.support.InMemorySupplierRepository;

class SupplierServiceTest {

    private MutableClock clock;
    private InMemorySupplierRepository repository;
    private SupplierService service;

    /** 04:00 UTC = 12:00 in Singapore. */
    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-09-25T04:00:00Z"));
        repository = new InMemorySupplierRepository(clock);
        SupplierProperties properties = new SupplierProperties(null, null, null, null, Duration.ofSeconds(60), null);
        service = new SupplierService(repository, clock, properties);
    }

    private static CatalogueQuery all() {
        return new CatalogueQuery(null, null, null, false, null, null, null, null, null, 1, 50);
    }

    @Test
    void catalogueIsCachedForTheTtlThenReloaded() {
        repository.create(details("Cool Spot", "Food", "Com2"), SupplierSource.SEED);
        service.search(all());
        service.search(all());
        assertThat(repository.findAllCalls).isEqualTo(1);

        clock.advance(Duration.ofSeconds(61));
        service.search(all());
        assertThat(repository.findAllCalls).isEqualTo(2);
    }

    @Test
    void writesInvalidateTheCacheImmediately() {
        assertThat(service.search(all()).totalItems()).isZero();
        Supplier created = service.create(details("Cool Spot", "Food", "Com2"));
        assertThat(service.search(all()).totalItems()).isEqualTo(1);

        service.deactivate(created.id());
        assertThat(service.search(all()).totalItems()).isZero();
    }

    @Test
    void createdSuppliersAreActiveAdminRecords() {
        Supplier created = service.create(details("Cool Spot", "Food", "Com2"));
        assertThat(created.active()).isTrue();
        assertThat(created.source()).isEqualTo(SupplierSource.ADMIN);
    }

    @Test
    void getThrowsForUnknownId() {
        assertThatThrownBy(() -> service.get("missing")).isInstanceOf(SupplierNotFoundException.class)
                .hasMessageContaining("missing");
    }

    @Test
    void deactivateIsIdempotentAndKeepsTheRecord() {
        Supplier created = service.create(details("Cool Spot", "Food", "Com2"));
        Supplier first = service.deactivate(created.id());
        Supplier second = service.deactivate(created.id());
        assertThat(first.active()).isFalse();
        assertThat(second).isEqualTo(first);
        assertThat(service.get(created.id()).active()).isFalse();
    }

    @Test
    void typesListsDistinctActiveTypes() {
        service.create(details("A", "Food", "Com2"));
        service.create(details("B", "food/coffee", "Com2"));
        service.create(details("C", "Food", "Com3"));
        Supplier hidden = service.create(details("D", "Printing", "Com3"));
        service.deactivate(hidden.id());
        assertThat(service.types()).containsExactly("Food", "food/coffee");
    }

    @Test
    void validatePairAcceptsTwoDifferentActiveSuppliers() {
        Supplier pickup = service.create(details("A", "Food", "Com2"));
        Supplier delivery = service.create(details("B", "Food", "Com3"));
        assertThat(service.validatePair(pickup.id(), delivery.id()).valid()).isTrue();
    }

    @Test
    void validatePairReportsEachProblem() {
        Supplier inactive = service.create(details("A", "Food", "Com2"));
        service.deactivate(inactive.id());

        PairValidation result = service.validatePair("missing", inactive.id());
        assertThat(result.valid()).isFalse();
        assertThat(result.problems()).extracting(PairValidation.Problem::reason)
                .containsExactly(Reason.NOT_FOUND, Reason.INACTIVE);

        PairValidation same = service.validatePair(inactive.id(), inactive.id());
        assertThat(same.problems()).extracting(PairValidation.Problem::reason).contains(Reason.SAME_SUPPLIER);
    }

    @Test
    void lookupAndOpenNow() {
        Supplier open = service.create(details("A", "Food", "Com2"));
        assertThat(service.lookup(List.of(open.id(), "missing"))).containsExactly(open);
        assertThat(service.isOpenNow(open)).isTrue();
        clock.advance(Duration.ofHours(10)); // 22:00 in Singapore
        assertThat(service.isOpenNow(open)).isFalse();
    }

    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return Clock.fixed(now, zone);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
