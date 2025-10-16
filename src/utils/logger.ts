import fs from 'fs';
import path from 'path';
import winston from 'winston';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, printf, colorize } = winston.format;

const isoTimestamp = timestamp({ format: () => new Date().toISOString() });

const fileFormat = printf(({ timestamp, level, message, ...meta }) => {
  const rest = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level}] ${message} ${rest}`;
});

const consoleFormat = combine(
  colorize({ all: true }),
  isoTimestamp,
  printf(({ timestamp, level, message, ...meta }) => {
    const rest = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} [${level}] ${message} ${rest}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error', format: combine(isoTimestamp, fileFormat) }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log'), format: combine(isoTimestamp, fileFormat) }),
  ],
});

// Add console transport with colorized levels
logger.add(new winston.transports.Console({ format: consoleFormat }));

export default logger;