import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

const errorMiddleware = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: err.statusCode,
      message: err.message,
    });
    return;
  }

  // 针对 express.json() 解析非法 JSON 的兜底处理
  if (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    (err as { status: number }).status === 400 &&
    'body' in err
  ) {
    res.status(400).json({
      status: 400,
      message: 'Invalid JSON payload.',
    });
    return;
  }

  console.error(err);

  res.status(500).json({
    status: 500,
    message: 'Internal server error.',
  });
};

export default errorMiddleware;