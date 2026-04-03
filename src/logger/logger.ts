import winston from "winston";
import path from "path";
import fs from "fs";

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: "info",
  transports: [
    // Append-only JSONL audit file
    new winston.transports.File({
      filename: path.join(logsDir, "audit.jsonl"),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      options: { flags: "a" }, // append-only, never overwrite
    }),
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, ...meta }) => {
          const status = meta.status === "ALLOWED" ? "✅" : "🚫";
          return `${status} [${level}] ${message} | ${JSON.stringify(meta)}`;
        })
      ),
    }),
  ],
});
