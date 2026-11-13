package sg.edu.nus.foc.supplier.seed;

/** A row that failed validation and was skipped (F2.5.1). */
public record SeedRowError(long rowNumber, String reason) {
}
