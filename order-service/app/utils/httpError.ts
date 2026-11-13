export class HttpError extends Error {
    status: number;
    code: string | undefined;
    errors: string[] | undefined;

    constructor(
        status: number,
        message: string,
        options: { code?: string; errors?: string[] } = {}
    ) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = options.code;
        this.errors = options.errors;
    }
}

export const badRequest = (message: string, errors?: string[]) => 
    new HttpError(400, message, errors ? { errors } : {});
export const unauthorized = (message: string) => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
export const conflict = (message: string, code?: string) => 
    new HttpError(409, message, code ? { code } : {});
export const serviceUnavailable = (message: string) => new HttpError(503, message);
