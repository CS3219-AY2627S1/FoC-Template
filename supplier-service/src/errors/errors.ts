export const DEFAULT_ERRORS: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    500: "INTERNAL_SERVER_ERROR",
};

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly isOperational: boolean;

    constructor(
        message: string,
        statusCode: number,
        code?: string,
    ) {
        super(message);

        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code ?? DEFAULT_ERRORS[statusCode as keyof typeof DEFAULT_ERRORS]
            ?? "INTERNAL_SERVER_ERROR";

        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}
