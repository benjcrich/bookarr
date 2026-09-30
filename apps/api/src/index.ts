import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db/database.js";
import { registerRoutes } from "./routes/index.js";
import { LibraryService } from "./services/library.js";
import { ProwlarrClient } from "./services/prowlarr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || "0.0.0.0";
  const dbPath = process.env.BOOKARR_DB_PATH || path.join(process.cwd(), "data", "bookarr.db");

  const db = openDatabase(dbPath);
  const prowlarr = new ProwlarrClient(
    process.env.PROWLARR_URL || "",
    process.env.PROWLARR_API_KEY || ""
  );

  // Sync env into settings store on boot
  const library = new LibraryService(db, prowlarr);
  const settings = library.getSettings();
  if (process.env.PROWLARR_URL || process.env.PROWLARR_API_KEY) {
    library.updateSettings({
      prowlarrUrl: process.env.PROWLARR_URL || settings.prowlarrUrl,
      prowlarrApiKey: process.env.PROWLARR_API_KEY || settings.prowlarrApiKey,
    });
  } else {
    prowlarr.updateConfig(settings.prowlarrUrl, settings.prowlarrApiKey);
  }

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await registerRoutes(app, library, prowlarr);

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

  await app.listen({ port, host });
  app.log.info(`Bookarr API listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
