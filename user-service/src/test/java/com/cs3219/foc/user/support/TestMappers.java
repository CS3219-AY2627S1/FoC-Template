package com.cs3219.foc.user.support;

import com.cs3219.foc.user.mapper.UserMapper;
import org.mapstruct.factory.Mappers;

public final class TestMappers {
    private TestMappers() {}

    public static UserMapper mapper() {
        return Mappers.getMapper(UserMapper.class);
    }
}
