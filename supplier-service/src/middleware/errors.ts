
export enum ErrorCode {
  UNAUTHORIZED = 'UNAUTHORIZED',
  BAD_REQUEST = 'BAD_REQUEST',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL = 'INTERNAL',
  NOT_FOUND = `NOT_FOUND`,
}

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;

  constructor(code: ErrorCode, statusCode: number, message: string) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
      this.name = this.constructor.name;
      Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized: admin privileges required') {
      super(ErrorCode.UNAUTHORIZED, 401, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
      super(ErrorCode.BAD_REQUEST, 400, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict: resource was modified concurrently') {
      super(ErrorCode.CONFLICT, 409, message);
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
      super(ErrorCode.RATE_LIMITED, 429, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Object not found') {
      super(ErrorCode.NOT_FOUND, 404, message);
  }
}
