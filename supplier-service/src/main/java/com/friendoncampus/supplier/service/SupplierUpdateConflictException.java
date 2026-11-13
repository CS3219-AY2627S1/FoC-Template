package com.friendoncampus.supplier.service;

import java.util.UUID;

public class SupplierUpdateConflictException extends RuntimeException {

    private final UUID supplierId;
    private final long requestedVersion;
    private final Long currentVersion;

    public SupplierUpdateConflictException(
            UUID supplierId,
            long requestedVersion,
            Long currentVersion,
            Throwable cause) {
        super("Supplier has changed since the requested version", cause);
        this.supplierId = supplierId;
        this.requestedVersion = requestedVersion;
        this.currentVersion = currentVersion;
    }

    public SupplierUpdateConflictException(
            UUID supplierId,
            long requestedVersion,
            long currentVersion) {
        this(supplierId, requestedVersion, currentVersion, null);
    }

    public UUID getSupplierId() {
        return supplierId;
    }

    public long getRequestedVersion() {
        return requestedVersion;
    }

    public Long getCurrentVersion() {
        return currentVersion;
    }
}
