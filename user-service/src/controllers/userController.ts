import type { Request, Response, NextFunction } from "express";
import * as userService from "../services/userService.js";
import { AppError } from "../utils/errors.js";

// ============================================================
// Get Current User Profile
// ============================================================

export const getCurrentUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const user = await userService.getCurrentUserProfile(req.user.id);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Update Current User Profile
// ============================================================

export const updateCurrentUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const { username, email, firstName, lastName } = req.body;

    const user = await userService.updateCurrentUserProfile(
      req.user.id,
      {
        username,
        email,
        firstName,
        lastName,
      }
    );

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Get User Profile By ID
// ============================================================

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const { userId } = req.params;

    if (!userId || typeof userId !== "string" || !UUID_V4_REGEX.test(userId)) {
      throw new AppError(400, "Invalid userId format. Must be a valid UUID.");
    }

    const user = await userService.getUserProfileById(
      userId,
      req.user.id,
      req.user.roles || []
    );

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};

// AI Assistance Disclosure:
// Tool: Gemini, date: 2026-10-03
// Scope: Implemented getUsersBatch controller with UUID array validation and length capping.
// Author review: Verified request body validation, 100-item rate threshold, and error codes.

// ============================================================
// Batch Get Users by IDs
// ============================================================

export const getUsersBatch = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      throw new AppError(400, "Request body must contain a non-empty 'userIds' array.");
    }

    if (userIds.length > 100) {
      throw new AppError(400, "Batch query limit exceeded. Maximum allowed is 100 user IDs.");
    }

    const isValid = userIds.every(
      (id) => typeof id === "string" && UUID_V4_REGEX.test(id)
    );
    if (!isValid) {
      throw new AppError(400, "All items in 'userIds' must be valid UUIDs.");
    }

    const users = await userService.getUsersBatch(userIds);

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

// AI Assistance Disclosure:
// Tool: Gemini, date: 2026-10-03
// Scope: Implemented changePassword controller for authenticated password rotation.
// Author review: Verified authenticated user presence and response status code.

// ============================================================
// Change Current User Password
// ============================================================

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const { currentPassword, newPassword } = req.body;

    await userService.changePassword(req.user.id, {
      currentPassword,
      newPassword,
    });

    res.status(200).json({ message: "Password changed successfully. Please log in again." });
  } catch (error) {
    next(error);
  }
};

// ============================================================
// List Users (Admin)
// ============================================================

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

const parsePositiveInt = (
  value: unknown,
  fallback: number,
  fieldName: string
): number => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new AppError(400, `'${fieldName}' must be a positive integer.`);
  }

  return parsed;
};

export const listUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const page = parsePositiveInt(req.query.page, 1, "page");
    const limit = parsePositiveInt(req.query.limit, DEFAULT_PAGE_LIMIT, "limit");

    if (limit > MAX_PAGE_LIMIT) {
      throw new AppError(400, `'limit' cannot exceed ${MAX_PAGE_LIMIT}.`);
    }

    const { search } = req.query;

    if (search !== undefined && typeof search !== "string") {
      throw new AppError(400, "'search' must be a single string.");
    }

    const trimmedSearch = search?.trim();

    if (trimmedSearch && trimmedSearch.length > MAX_SEARCH_LENGTH) {
      throw new AppError(400, `'search' cannot exceed ${MAX_SEARCH_LENGTH} characters.`);
    }

    const result = await userService.listUsers({
      page,
      limit,
      search: trimmedSearch || undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Update User Active Status (Admin)
// ============================================================

export const updateUserStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    const { id } = req.params;

    if (!id || typeof id !== "string" || !UUID_V4_REGEX.test(id)) {
      throw new AppError(400, "Invalid user ID format. Must be a valid UUID.");
    }

    const { isActive } = req.body ?? {};

    if (typeof isActive !== "boolean") {
      throw new AppError(400, "Request body must contain a boolean 'isActive'.");
    }

    const user = await userService.updateUserStatus(req.user.id, id, isActive);

    res.status(200).json(user);
  } catch (error) {
    next(error);
  }
};
