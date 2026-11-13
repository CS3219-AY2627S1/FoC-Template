package com.cs3219.foc.supplier.mapper;

import com.cs3219.foc.supplier.model.dto.OpeningHoursDto;
import com.cs3219.foc.supplier.model.dto.SupplierDto;
import com.cs3219.foc.supplier.model.dto.SupplierRequest;
import com.cs3219.foc.supplier.model.entity.Supplier;
import com.cs3219.foc.supplier.model.entity.SupplierOpeningHours;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;

@Mapper
public interface SupplierMapper {
    @Mapping(target = "imageUrl", source = "imageUrl")
    SupplierDto toSupplierDto(Supplier supplier, String imageUrl);

    OpeningHoursDto toOpeningHoursDto(SupplierOpeningHours hours);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "openingHours", ignore = true)
    @Mapping(target = "imageKey", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    Supplier toSupplier(SupplierRequest request);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "active", ignore = true)
    @Mapping(target = "openingHours", ignore = true)
    @Mapping(target = "imageKey", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    void updateSupplier(SupplierRequest request, @MappingTarget Supplier supplier);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "supplier", ignore = true)
    SupplierOpeningHours toOpeningHours(OpeningHoursDto hours);

    List<SupplierOpeningHours> toOpeningHours(List<OpeningHoursDto> hours);
}
