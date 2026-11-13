package com.friendoncampus.supplier.service;

public record DeleteSupplierCommand(long version) {

    public static DeleteSupplierCommand from(String version) {
        if (version == null) {
            throw new InvalidSupplierQueryException(
                    "version query parameter is required");
        }
        if (version.isBlank()) {
            throw invalidVersion();
        }

        try {
            long parsedVersion = Long.parseLong(version.trim());
            if (parsedVersion < 0) {
                throw invalidVersion();
            }
            return new DeleteSupplierCommand(parsedVersion);
        } catch (NumberFormatException exception) {
            throw invalidVersion();
        }
    }

    private static InvalidSupplierQueryException invalidVersion() {
        return new InvalidSupplierQueryException(
                "version must be a nonnegative whole number");
    }
}
