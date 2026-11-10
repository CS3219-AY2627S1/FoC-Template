import argon2 from "argon2";
import { prisma } from "../libs/prisma.js";
import type { LoginInput } from "../schemas/auth.schema.js";
import { AppError } from "../errors/errors.js";
import { generateAccessToken } from "../libs/accessToken.js";
import { generateRefreshToken, verifyRefreshToken } from "../libs/refreshToken.js";
import { REFRESH_TOKEN_MAX_AGE } from "../constants/auth.constants.js";

export async function loginUser(input: LoginInput) {
    const user = await prisma.user.findUnique({
        where: {
            email: input.email,
        },
    });

    if (!user) {
        throw new AppError("Invalid email or password provided", 401, "INVALID_CREDENTIALS");
    }

    const passwordValid = await argon2.verify(
        user.password,
        input.password,
    );

    if (!passwordValid) {
        throw new AppError("Invalid email or password provided", 401, "INVALID_CREDENTIALS");
    }

    // Generate JWT access token
    const accessToken = generateAccessToken({
        userId: user.userId,
        email: user.email,
        role: user.role,
    });

    // Generate JWT refresh token
    const { refreshToken, tokenId } = generateRefreshToken(user.userId);
    const tokenHash = await argon2.hash(refreshToken);

    // Store the refresh token in the database
    await prisma.refreshToken.create({
        data: {
            tokenId,
            tokenHash,
            userId: user.userId,
            expiresAt: new Date(
                Date.now() + REFRESH_TOKEN_MAX_AGE
            ),
        },
    });

    return {
        accessToken,
        refreshToken,
        user: {
            id: user.userId,
            email: user.email,
            username: user.username,
            phoneNumber: user.phoneNumber,
            role: user.role,
        },
    };
}

export async function logoutUser(refreshToken: string) {
    // Verify the refresh token using jwt and the secret key
    const payload = verifyRefreshToken(refreshToken);

    await prisma.refreshToken.updateMany({
        where: {
            tokenId: payload.jti,
            revokedAt: null,
        },
        data: {
            revokedAt: new Date(),
        }
    });
}