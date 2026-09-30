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
  const pollMs = Number(process.env.BOOKARR_DOWNLOAD_POLL_MS || 3000);

  const db = openDatabase(dbPath);
  const prowlarr = new ProwlarrClient(
    process.env.PROWLARR_URL || "",
    process.env.PROWLARR_API_KEY || ""
  );

  const bootstrapSettings = {
    prowlarrUrl: process.env.PROWLARR_URL || "",
    prowlarrApiKey: process.env.PROWLARR_API_KEY || "",
    libraryRoot: process.env.BOOKARR_LIBRARY_ROOT || "/data/audiobooks",
    qualityProfileId: 1,
    autoSearchOnApprove: true,
    downloadClientMode: (process.env.DOWNLOAD_CLIENT_MODE === "auto" ? "auto" : "mock") as
      | "mock"
      | "auto",
    qbittorrentUrl: process.env.QBITTORRENT_URL || "",
    qbittorrentUsername: process.env.QBITTORRENT_USERNAME || "admin",
    qbittorrentPassword: process.env.QBITTORRENT_PASSWORD || "",
    qbittorrentCategory: process.env.QBITTORRENT_CATEGORY || "bookarr",
    sabnzbdUrl: process.env.SABNZBD_URL || "",
    sabnzbdApiKey: process.env.SABNZBD_API_KEY || "",
    sabnzbdCategory: process.env.SABNZBD_CATEGORY || "bookarr",
    metadataMode: (process.env.METADATA_MODE === "mock" ? "mock" : "auto") as "mock" | "auto",
    hardcoverApiKey: process.env.HARDCOVER_API_KEY || "",
    metadataCacheTtlHours: Number(process.env.METADATA_CACHE_TTL_HOURS || 24),
  };

  const clients = new DownloadClientRegistry(bootstrapSettings);
  const library = new LibraryService(db, prowlarr, clients);

  // Persist env overrides into settings on boot
  const settings = library.getSettings();
  library.updateSettings({
    prowlarrUrl: process.env.PROWLARR_URL || settings.prowlarrUrl,
    prowlarrApiKey: process.env.PROWLARR_API_KEY || settings.prowlarrApiKey,
    libraryRoot: process.env.BOOKARR_LIBRARY_ROOT || settings.libraryRoot,
    downloadClientMode:
      process.env.DOWNLOAD_CLIENT_MODE === "auto"
        ? "auto"
        : process.env.DOWNLOAD_CLIENT_MODE === "mock"
          ? "mock"
          : settings.downloadClientMode,
    qbittorrentUrl: process.env.QBITTORRENT_URL || settings.qbittorrentUrl,
    qbittorrentUsername: process.env.QBITTORRENT_USERNAME || settings.qbittorrentUsername,
    qbittorrentPassword: process.env.QBITTORRENT_PASSWORD || settings.qbittorrentPassword,
    qbittorrentCategory: process.env.QBITTORRENT_CATEGORY || settings.qbittorrentCategory,
    sabnzbdUrl: process.env.SABNZBD_URL || settings.sabnzbdUrl,
    sabnzbdApiKey: process.env.SABNZBD_API_KEY || settings.sabnzbdApiKey,
    sabnzbdCategory: process.env.SABNZBD_CATEGORY || settings.sabnzbdCategory,
    metadataMode:
      process.env.METADATA_MODE === "mock"
        ? "mock"
        : process.env.METADATA_MODE === "auto"
          ? "auto"
          : settings.metadataMode,
    hardcoverApiKey: process.env.HARDCOVER_API_KEY || settings.hardcoverApiKey,
    metadataCacheTtlHours: process.env.METADATA_CACHE_TTL_HOURS
      ? Number(process.env.METADATA_CACHE_TTL_HOURS)
      : settings.metadataCacheTtlHours,
  });

  const metadata = new MetadataService(db, library.getSettings());
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

  const timer = setInterval(() => {
    library.pollDownloads().catch((err) => app.log.warn({ err }, "download poll failed"));
  }, pollMs);
  timer.unref?.();

  await app.listen({ port, host });
  app.log.info(`Bookarr API listening on http://${host}:${port}`);
  app.log.info(`Download poll interval ${pollMs}ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
