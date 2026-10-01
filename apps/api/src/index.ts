import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/database.js";
import { defaultSettings } from "./domain/defaults.js";
import { log, parseLogLevel } from "./log.js";
import { registerRoutes } from "./routes/index.js";
import { DownloadClientRegistry } from "./services/download-clients/index.js";
import { LibraryService } from "./services/library.js";
import { MetadataService } from "./services/metadata/index.js";
import { ProwlarrClient } from "./services/prowlarr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "0.0.0.0";
  const dbPath = process.env.BOOKARR_DB_PATH || path.join(process.cwd(), "data", "bookarr.db");
  const bootLogLevel = parseLogLevel(process.env.LOG_LEVEL, "info");
  log.setLevel(bootLogLevel);

  const db = openDatabase(dbPath);
  const prowlarr = new ProwlarrClient("", "");
  const clients = new DownloadClientRegistry(defaultSettings());
  const library = new LibraryService(db, prowlarr, clients);

  // Env bootstraps missing keys only — UI/DB values are never overwritten on restart
  library.bootstrapEnvIntoDb();
  const settings = library.getSettings();
  log.setLevel(settings.logLevel);
  prowlarr.updateConfig(settings.prowlarrUrl, settings.prowlarrApiKey);
  clients.updateFromSettings(settings);

  const metadata = new MetadataService(db, settings);
  library.setMetadataService(metadata);

  // Quiet by default: no per-request access spam. Debug enables HTTP access lines.
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });
  await app.register(cors, { origin: true });

  app.addHook("onResponse", async (req, reply) => {
    if (log.getLevel() === "debug") {
      log.debug("http", {
        method: req.method,
        url: req.url,
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
      });
      return;
    }
    // Default: no access spam — only failed API responses
    if (!req.url.startsWith("/api/")) return;
    if (reply.statusCode < 400) return;
    log.warn("http.error", {
      method: req.method,
      url: req.url,
      status: reply.statusCode,
      ms: Math.round(reply.elapsedTime),
    });
  });

  await registerRoutes(app, library, prowlarr, clients, metadata);

  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Not found" });
      }
      return reply.sendFile("index.html");
    });
  }

  // Poll loop reads interval from settings each cycle (hot-reload friendly)
  let polling = true;
  const pollLoop = async () => {
    while (polling) {
      const ms = Math.max(500, library.getSettings().downloadPollMs || 3000);
      try {
        await library.pollDownloads();
      } catch (err) {
        log.warn("download.poll.failed", { error: (err as Error).message });
      }
      await new Promise((r) => setTimeout(r, ms));
    }
  };
  void pollLoop();

  await app.listen({ port, host });
  log.info("bookarr.started", {
    host,
    port,
    dbPath,
    logLevel: settings.logLevel,
  });
  log.info("bookarr.config", library.settingsSummary(settings));

  const shutdown = () => {
    polling = false;
    log.info("bookarr.shutdown");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("ERROR bookarr.fatal", err);
  process.exit(1);
});
