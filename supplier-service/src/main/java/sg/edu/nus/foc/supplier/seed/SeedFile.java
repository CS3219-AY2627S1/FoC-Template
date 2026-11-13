package sg.edu.nus.foc.supplier.seed;

import java.util.List;

public record SeedFile(List<SeedRow> rows, List<SeedRowError> errors) {
}
