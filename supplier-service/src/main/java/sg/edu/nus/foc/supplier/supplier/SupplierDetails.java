package sg.edu.nus.foc.supplier.supplier;

import java.time.LocalTime;

/**
 * The editable attributes of a supplier; mirrors the columns of the supplier seed CSV.
 *
 * @param type        category as used in the seed data, e.g. Food, Food/Coffee, Printing, Shopping
 * @param building    campus building; together with {@code name} it identifies a supplier (F1.1.2)
 * @param floor       free text so values like "B1" are allowed; may be null
 * @param openingTime local campus time (Asia/Singapore)
 * @param closingTime may be earlier than {@code openingTime} for suppliers open past midnight
 * @param imageUrl    optional
 */
public record SupplierDetails(
        String name,
        String type,
        String building,
        String floor,
        String locationDescription,
        double latitude,
        double longitude,
        LocalTime openingTime,
        LocalTime closingTime,
        String imageUrl) {

    public String naturalKey() {
        return NaturalKey.of(name, building);
    }
}
