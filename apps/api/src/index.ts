import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/database.js";
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

  const db = openDatabase(dbPath);
  const prowlarr = new ProwlarrClient("", "");
  const clients = new DownloadClientRegistry({
    prowlarrUrl: "",
    prowlarrApiKey: "",
    libraryRoot: "/data/audiobooks",
    qualityProfileId: 1,
    autoSearchOnApprove: true,
    downloadClientMode: "mock",
    qbittorrentUrl: "",
    qbittorrentUsername: "admin",
    qbittorrentPassword: "",
    qbittorrentCategory: "bookarr",
    sabnzbdUrl: "",
    sabnzbdApiKey: "",
    sabnzbdCategory: "bookarr",
    metadataMode: "auto",
    hardcoverApiKey: "",
    metadataCacheTtlHours: 24,
    downloadPollMs: 3000,
    mockDownloadMs: 1500,
  });
  const library = new LibraryService(db, prowlarr, clients);

  // Env bootstraps missing keys only — UI/DB values are never overwritten on restart
  library.bootstrapEnvIntoDb();
  const settings = library.getSettings();
  prowlarr.updateConfig(settings.prowlarrUrl, settings.prowlarrApiKey);
  clients.updateFromSettings(settings);

  const metadata = new MetadataService(db, settings);
  library.setMetadataService(metadata);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
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
        app.log.warn({ err }, "download poll failed");
      }
      await new Promise((r) => setTimeout(r, ms));
    }
  };
  void pollLoop();

  await app.listen({ port, host });
  app.log.info(`Bookarr API listening on http://${host}:${port}`);
  app.log.info(
    `Settings precedence: UI/DB wins; env bootstraps missing keys only (poll=${settings.downloadPollMs}ms)`
  );

  const shutdown = () => {
    polling = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
