package sg.edu.nus.foc.supplier.seed;

/**
 * Outcome of one seed load (F2.5.3).
 *
 * @param preserved rows whose supplier an administrator manages (created or changed it), left as they are
 */
public record SeedReport(int created, int updated, int unchanged, int preserved, int deactivated, int skipped) {
}
