package com.cs3219.foc.supplier.model.dto;

import com.cs3219.foc.supplier.model.entity.SupplierCategory;
import java.util.List;

/**
 * Optional filters to list suppliers. Empty values means "no filter"
 *
 * @param query case-insensitive text compare with name, building and location description
 * @param categories suppliers in any of the categories
 * @param openNow only suppliers open at the current Singapore time zone
 * @param includeInactive also return deactivated suppliers (for admin use only)
 */
public record SupplierSearchCriteria(
        String query, List<SupplierCategory> categories, boolean openNow, boolean includeInactive) {

    public static SupplierSearchCriteria activeOnly() {
        return new SupplierSearchCriteria(null, List.of(), false, false);
    }
}
