package sg.edu.nus.foc.supplier.supplier;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.function.UnaryOperator;

/** Persistence port for suppliers. Implementations must enforce name + building uniqueness atomically. */
public interface SupplierRepository {

    List<Supplier> findAll();

    Optional<Supplier> findById(String id);

    /** Returns the suppliers that exist, in no particular order; unknown IDs are skipped. */
    List<Supplier> findAllById(Collection<String> ids);

    Optional<Supplier> findByNaturalKey(String naturalKey);

    /**
     * Creates an active supplier. Records from the seed file remember their row's natural key as the seed key.
     *
     * @throws DuplicateSupplierException if another supplier has the same name + building
     */
    Supplier create(SupplierDetails details, SupplierSource source);

    /**
     * An administrator's edit (F6.2): applies {@code change} to the stored details and sets the active flag
     * ({@code null} keeps it) in one transaction, so concurrent edits of different fields are not lost.
     * Marks the record as admin-modified; the ID, source and creation time never change (F6.2.3).
     *
     * @throws SupplierNotFoundException  if {@code id} does not exist
     * @throws DuplicateSupplierException if the new name + building belongs to another supplier
     */
    Supplier update(String id, UnaryOperator<SupplierDetails> change, Boolean active);

    /**
     * Seed load (F2.3): replaces the details of a record the seed loader manages, keeping its active flag.
     *
     * @return the updated record, or empty (nothing written) if it is not {@link Supplier#managedBySeed()}
     * @throws SupplierNotFoundException  if {@code id} does not exist
     * @throws DuplicateSupplierException if the new name + building belongs to another supplier
     */
    Optional<Supplier> updateFromSeed(String id, SupplierDetails details);

    /**
     * Seed load (F2.4): deactivates a record whose row left the seed file.
     *
     * @return the updated record, or empty (nothing written) if it is inactive or not
     *         {@link Supplier#managedBySeed()}
     * @throws SupplierNotFoundException if {@code id} does not exist
     */
    Optional<Supplier> deactivateFromSeed(String id);
}
