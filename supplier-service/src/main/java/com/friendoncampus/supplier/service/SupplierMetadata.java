package com.friendoncampus.supplier.service;

import java.util.List;

public record SupplierMetadata(List<String> types, List<String> buildings) {

    public SupplierMetadata {
        types = List.copyOf(types);
        buildings = List.copyOf(buildings);
    }
}
