import {ZodType} from "zod";
import {Request, Response, NextFunction} from "express";

export enum ValidationSource {
    BODY = "body",
    QUERY = "query",
    HEADER = "headers",
    PARAM = "params"
}

export const validateRequest = (schema:ZodType, source: ValidationSource) => {
    return (req:Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req[source]);
        if (!result.success) {
            return next(result.error);
        }
        if (source === ValidationSource.BODY) {
            req.body = result.data;
        }
        next();
    }
}
