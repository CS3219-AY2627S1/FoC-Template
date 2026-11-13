package com.cs3219.foc.supplier.support;

import com.cs3219.foc.supplier.mapper.SupplierMapper;
import org.mapstruct.factory.Mappers;

public final class TestMappers {
    private TestMappers() {}

    public static SupplierMapper mapper() {
        return Mappers.getMapper(SupplierMapper.class);
    }
}
