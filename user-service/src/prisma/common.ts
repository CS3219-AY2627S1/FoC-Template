// ensure no db import dependency so that circular import cannot happen

export enum ErrorType {
    Unknown,
    ConstraintViolation,
    NotFound,
    Custom,
};

export interface Params {
    message: string;
    status?: ErrorType;
    isUserFault: boolean;
}

export class DbError extends Error {
    status: ErrorType;
    isUserFault: boolean;

    constructor(param: Params) {
        super(param.message);
        this.status = param.status ?? ErrorType.Unknown;
        this.isUserFault = param.isUserFault ?? false;
    }
}

export enum Role {
    Admin = "admin",
    Requestor = "requestor",
    Courier = "courier",
}
