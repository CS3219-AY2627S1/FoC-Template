package sg.edu.nus.foc.supplier.api;

import java.util.List;

public record ItemsResponse<T>(List<T> items) {
}
