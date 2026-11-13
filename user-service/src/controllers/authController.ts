import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/authService.js";
import { AppError } from "../utils/errors.js";

// ============================================================
// Registration
// ============================================================

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { username, email, password, firstName, lastName } = req.body;

    const user = await authService.register({
      username,
      email,
      password,
      firstName,
      lastName,
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Login
// ============================================================

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { identifier, password } = req.body;

    const result = await authService.login({
      identifier,
      password,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Refresh
// ============================================================

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const result = await authService.refresh({
      refreshToken,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// ============================================================
// Logout
// ============================================================

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError(401, "Authentication required.");
    }

    if (!req.user.jti || req.user.exp === undefined) {
      throw new AppError(401, "Authentication required.");
    }

    const { refreshToken } = req.body || {};

    await authService.logout({
      userId: req.user.id,
      jti: req.user.jti,
      exp: req.user.exp,
      refreshToken,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
};
