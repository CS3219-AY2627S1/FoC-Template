package sg.edu.nus.foc.supplier.api;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import sg.edu.nus.foc.supplier.supplier.PairValidation;
import sg.edu.nus.foc.supplier.supplier.SupplierService;

@RestController
@ConditionalOnProperty(name = "FOC_INTERNAL_ORDER_API_ENABLED", havingValue = "true")
public class InternalOrderLocationsController {
    private final SupplierService suppliers;

    public InternalOrderLocationsController(SupplierService suppliers) {
        this.suppliers = suppliers;
    }

    @PostMapping("/api/suppliers/internal/order-locations/validate")
    @Operation(summary = "Validate automatic-repost locations for Order Service",
            description = "Private service network only, no user JWT. Same active/distinct supplier rules as ordinary validation.")
    @ApiResponse(responseCode = "200", description = "Pair validation, including authoritative valid boolean")
    @ApiResponse(responseCode = "400", description = "Invalid supplier ID input")
    public PairValidation validate(@Valid @RequestBody ValidatePairRequest input) {
        return suppliers.validatePair(input.pickupSupplierId().strip(), input.deliverySupplierId().strip());
    }
}
