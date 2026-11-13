package com.cs3219.foc.user.service;

import static com.cs3219.foc.user.config.NusConfig.FACULTIES;

import java.util.List;

final class NusFacultyPolicy {
    private NusFacultyPolicy() {}

    public static final String UNASSIGNED_FACULTY = "UNASSIGNED";

    public static List<String> getFaculties() {
        return FACULTIES;
    }

    public static boolean isValidForFiltering(String faculty) {
        return faculty == null || UNASSIGNED_FACULTY.equals(faculty) || FACULTIES.contains(faculty);
    }

    public static boolean isValidForAssignment(String faculty) {
        return faculty == null || faculty.isEmpty() || FACULTIES.contains(faculty);
    }
}
