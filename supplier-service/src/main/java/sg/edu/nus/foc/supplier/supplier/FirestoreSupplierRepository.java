package sg.edu.nus.foc.supplier.supplier;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ExecutionException;
import java.util.function.Function;
import java.util.function.UnaryOperator;

import com.google.api.core.ApiFuture;
import com.google.cloud.Timestamp;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import org.springframework.stereotype.Repository;

/**
 * Firestore layout:
 * <ul>
 *   <li>{@code suppliers/{id}}: one document per supplier, auto-generated ID. {@code seedKey} and
 *       {@code adminModified} record whether the seed loader may still change it.</li>
 *   <li>{@code supplierKeys/{sha256(name|building)}}: {@code {supplierId}}, a uniqueness index.
 *       Firestore has no unique constraints, so creates and renames claim the key document in
 *       the same transaction as the supplier write.</li>
 * </ul>
 */
@Repository
public class FirestoreSupplierRepository implements SupplierRepository {

    static final String SUPPLIERS = "suppliers";
    static final String SUPPLIER_KEYS = "supplierKeys";

    private final Firestore firestore;
    private final Clock clock;

    public FirestoreSupplierRepository(Firestore firestore, Clock clock) {
        this.firestore = firestore;
        this.clock = clock;
    }

    @Override
    public List<Supplier> findAll() {
        return await(suppliers().get()).getDocuments().stream().map(FirestoreSupplierRepository::fromDocument).toList();
    }

    @Override
    public Optional<Supplier> findById(String id) {
        if (!isValidDocumentId(id)) {
            return Optional.empty();
        }
        DocumentSnapshot snapshot = await(suppliers().document(id).get());
        return snapshot.exists() ? Optional.of(fromDocument(snapshot)) : Optional.empty();
    }

    @Override
    public List<Supplier> findAllById(Collection<String> ids) {
        DocumentReference[] refs = new LinkedHashSet<>(ids).stream()
                .filter(FirestoreSupplierRepository::isValidDocumentId)
                .map(id -> suppliers().document(id))
                .toArray(DocumentReference[]::new);
        if (refs.length == 0) {
            return List.of();
        }
        return await(firestore.getAll(refs)).stream()
                .filter(DocumentSnapshot::exists)
                .map(FirestoreSupplierRepository::fromDocument)
                .toList();
    }

    @Override
    public Optional<Supplier> findByNaturalKey(String naturalKey) {
        DocumentSnapshot key = await(keys().document(naturalKey).get());
        return key.exists() ? findById(key.getString("supplierId")) : Optional.empty();
    }

    @Override
    public Supplier create(SupplierDetails details, SupplierSource source) {
        Instant now = clock.instant();
        String seedKey = source == SupplierSource.SEED ? details.naturalKey() : null;
        return await(firestore.runTransaction(tx -> {
            DocumentReference keyRef = keys().document(details.naturalKey());
            DocumentSnapshot key = tx.get(keyRef).get();
            if (key.exists()) {
                throw new DuplicateSupplierException(key.getString("supplierId"));
            }
            DocumentReference ref = suppliers().document();
            Supplier supplier = new Supplier(ref.getId(), details, true, source, seedKey, false, now, now);
            tx.set(ref, toDocument(supplier));
            tx.set(keyRef, Map.of("supplierId", ref.getId()));
            return supplier;
        }));
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

    /**
     * Reads the supplier, applies {@code change} and writes the result in one transaction. Firestore re-runs
     * the transaction on contention, so {@code change} always sees the latest committed record. An empty
     * result writes nothing. A rename moves the uniqueness key in the same transaction.
     */
    private Optional<Supplier> modify(String id, Function<Supplier, Optional<Supplier>> change) {
        if (!isValidDocumentId(id)) {
            throw new SupplierNotFoundException(id);
        }
        Instant now = clock.instant();
        return await(firestore.runTransaction(tx -> {
            DocumentReference ref = suppliers().document(id);
            DocumentSnapshot current = tx.get(ref).get();
            if (!current.exists()) {
                throw new SupplierNotFoundException(id);
            }
            Supplier existing = fromDocument(current);
            Optional<Supplier> changed = change.apply(existing);
            if (changed.isEmpty()) {
                return Optional.<Supplier>empty();
            }
            String oldKey = existing.details().naturalKey();
            String newKey = changed.get().details().naturalKey();
            DocumentReference newKeyRef = keys().document(newKey);
            if (!oldKey.equals(newKey)) {
                DocumentSnapshot claimed = tx.get(newKeyRef).get();
                if (claimed.exists() && !id.equals(claimed.getString("supplierId"))) {
                    throw new DuplicateSupplierException(claimed.getString("supplierId"));
                }
            }
            // All reads above, writes below (Firestore transaction rule).
            Supplier updated = changed.get().updatedAt(now);
            tx.set(ref, toDocument(updated));
            if (!oldKey.equals(newKey)) {
                tx.delete(keys().document(oldKey));
                tx.set(newKeyRef, Map.of("supplierId", id));
            }
            return Optional.of(updated);
        }));
    }

    private CollectionReference suppliers() {
        return firestore.collection(SUPPLIERS);
    }

    private CollectionReference keys() {
        return firestore.collection(SUPPLIER_KEYS);
    }

    /** Rejects IDs Firestore cannot address (slashes, "." / "..", reserved names) instead of erroring. */
    static boolean isValidDocumentId(String id) {
        return id != null && !id.isBlank() && id.length() <= 128 && !id.contains("/")
                && !id.equals(".") && !id.equals("..") && !(id.startsWith("__") && id.endsWith("__"));
    }

    static Map<String, Object> toDocument(Supplier supplier) {
        SupplierDetails d = supplier.details();
        Map<String, Object> doc = new HashMap<>();
        doc.put("name", d.name());
        doc.put("type", d.type());
        doc.put("building", d.building());
        doc.put("floor", d.floor());
        doc.put("locationDescription", d.locationDescription());
        doc.put("latitude", d.latitude());
        doc.put("longitude", d.longitude());
        doc.put("openingTime", d.openingTime().toString());
        doc.put("closingTime", d.closingTime().toString());
        doc.put("imageUrl", d.imageUrl());
        doc.put("active", supplier.active());
        doc.put("source", supplier.source().name());
        doc.put("seedKey", supplier.seedKey());
        doc.put("adminModified", supplier.adminModified());
        doc.put("createdAt", toTimestamp(supplier.createdAt()));
        doc.put("updatedAt", toTimestamp(supplier.updatedAt()));
        return doc;
    }

    static Supplier fromDocument(DocumentSnapshot doc) {
        SupplierDetails details = new SupplierDetails(
                doc.getString("name"),
                doc.getString("type"),
                doc.getString("building"),
                doc.getString("floor"),
                doc.getString("locationDescription"),
                numberOrZero(doc.getDouble("latitude")),
                numberOrZero(doc.getDouble("longitude")),
                LocalTime.parse(doc.getString("openingTime")),
                LocalTime.parse(doc.getString("closingTime")),
                doc.getString("imageUrl"));
        return new Supplier(
                doc.getId(),
                details,
                Boolean.TRUE.equals(doc.getBoolean("active")),
                SupplierSource.valueOf(doc.getString("source")),
                // Absent on records written before these fields existed.
                doc.getString("seedKey"),
                Boolean.TRUE.equals(doc.getBoolean("adminModified")),
                toInstant(doc.getTimestamp("createdAt")),
                toInstant(doc.getTimestamp("updatedAt")));
    }

    private static double numberOrZero(Double value) {
        return value != null ? value : 0;
    }

    private static Timestamp toTimestamp(Instant instant) {
        return Timestamp.ofTimeSecondsAndNanos(instant.getEpochSecond(), instant.getNano());
    }

    private static Instant toInstant(Timestamp timestamp) {
        return timestamp != null ? timestamp.toSqlTimestamp().toInstant() : null;
    }

    /** Unwraps Firestore futures so domain exceptions thrown inside transactions surface unchanged. */
    private static <T> T await(ApiFuture<T> future) {
        try {
            return future.get();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for Firestore", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            while (cause instanceof ExecutionException && cause.getCause() != null) {
                cause = cause.getCause();
            }
            if (cause instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException("Firestore operation failed", cause);
        }
    }
}
