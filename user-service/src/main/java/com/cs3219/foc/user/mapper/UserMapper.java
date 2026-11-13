package com.cs3219.foc.user.mapper;

import com.cs3219.foc.user.model.dto.UpdateUserProfileRequest;
import com.cs3219.foc.user.model.dto.UpdateUserRequest;
import com.cs3219.foc.user.model.dto.UserBriefDto;
import com.cs3219.foc.user.model.dto.UserDto;
import com.cs3219.foc.user.model.dto.UserProfileDto;
import com.cs3219.foc.user.model.entity.User;
import org.mapstruct.BeanMapping;
import org.mapstruct.CollectionMappingStrategy;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.Named;
import org.mapstruct.NullValuePropertyMappingStrategy;

@Mapper(collectionMappingStrategy = CollectionMappingStrategy.TARGET_IMMUTABLE)
public interface UserMapper {
    UserBriefDto toUserBriefDto(User user);

    @Mapping(target = "avatarUrl", source = "avatarUrl")
    UserProfileDto toUserProfileDto(User user, String avatarUrl);

    @Mapping(target = "avatarUrl", source = "avatarUrl")
    UserDto toUserDto(User user, String avatarUrl);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "name", source = "name")
    @Mapping(target = "roles", source = "roles")
    @Mapping(
            target = "phoneNumber",
            source = "phoneNumber",
            qualifiedByName = "emptyToNull",
            nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(
            target = "faculty",
            source = "faculty",
            qualifiedByName = "emptyToNull",
            nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    void updateUser(UpdateUserRequest request, @MappingTarget User user);

    @BeanMapping(ignoreByDefault = true)
    @Mapping(target = "name", source = "name")
    @Mapping(target = "phoneNumber", source = "phoneNumber")
    @Mapping(target = "faculty", source = "faculty")
    void updateUserProfile(UpdateUserProfileRequest request, @MappingTarget User user);

    @Named("emptyToNull")
    default String emptyToNull(String value) {
        return value == null || value.isEmpty() ? null : value;
    }
}
