export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function parseLogLevel(value: string | undefined | null, fallback: LogLevel = "info"): LogLevel {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return fallback;
}

type Fields = Record<string, unknown>;

/**
 * Small structured logger for docker logs.
 * Lines look like: `INFO  prowlarr.search query="Mistborn" results=3`
 */
export class AppLogger {
  private level: LogLevel;

  constructor(level: LogLevel = "info") {
    this.level = level;
  }

  setLevel(level: LogLevel | string): void {
    this.level = parseLogLevel(level, this.level);
  }

  getLevel(): LogLevel {
    return this.level;
  }

  debug(msg: string, fields?: Fields): void {
    this.write("debug", msg, fields);
  }

  info(msg: string, fields?: Fields): void {
    this.write("info", msg, fields);
  }

  warn(msg: string, fields?: Fields): void {
    this.write("warn", msg, fields);
  }

  error(msg: string, fields?: Fields): void {
    this.write("error", msg, fields);
  }

  private write(level: LogLevel, msg: string, fields?: Fields): void {
    if (ORDER[level] < ORDER[this.level]) return;
    const parts = [`${level.toUpperCase().padEnd(5)} ${msg}`];
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        parts.push(`${k}=${formatField(v)}`);
      }
    }
    const line = parts.join(" ");
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

function formatField(v: unknown): string {
  if (v == null) return "null";
  if (typeof v === "string") {
    if (/[\s="]/.test(v)) return JSON.stringify(v);
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v instanceof Error) return JSON.stringify(v.message);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export const log = new AppLogger(parseLogLevel(process.env.LOG_LEVEL, "info"));
