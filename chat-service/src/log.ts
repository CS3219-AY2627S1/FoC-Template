import winston from 'winston';
import path from 'node:path';
import config from "./config.ts";

// Console format (pretty + colour)
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, stack } = info;
    const stackStr = stack ? `\n${stack}` : '';
    return `${timestamp} [${level}]: ${message}${stackStr}`;
  })
);

// File format (clean, no colour)
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}`
  )
);

const generateFileLoggers = () => {
    if (!config.shouldGenerateLogfile)
        return [];
    return [
        new winston.transports.File({
          filename: path.join('logs', 'error.log'),
          level: 'error',
          format: fileFormat,
        }),
        new winston.transports.File({
          filename: path.join('logs', 'combined.log'),
          format: fileFormat,
        })
    ];
}

// Create the logger
export default winston.createLogger({
  level: process.env.LOG_LEVEL || 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
  ),
  transports: [
    ...generateFileLoggers(),
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? winston.format.json() : consoleFormat,
    }),
  ],
  exitOnError: false,
});
