import { Request, Response, NextFunction } from "express";
import * as roleService from "../services/roleService.js";
import { AppError } from "../utils/errors.js";

export const getUserRoles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    if (typeof id !== "string") {
      throw new AppError(400, "Invalid user ID.");
    }

    const result = await roleService.getUserRoles(id);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const addRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (typeof id !== "string") {
      throw new AppError(400, "Invalid user ID.");
    }

    if (!role || typeof role !== "string") {
      throw new AppError(400, "Role name is required.");
    }

    const result = await roleService.addRoleToUser(id, role.toUpperCase());

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const removeRole = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id, role } = req.params;
    const requesterUserId = req.user?.id;

    if (!requesterUserId) {
      throw new AppError(401, "Authentication required.");
    }

    if (typeof id !== "string") {
      throw new AppError(400, "Invalid user ID.");
    }

    if (!role || typeof role !== "string") {
      throw new AppError(400, "Role parameter is required.");
    }

    const result = await roleService.removeRoleFromUser(
      requesterUserId,
      id,
      role.toUpperCase()
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
