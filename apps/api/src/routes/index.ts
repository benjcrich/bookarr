import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { parseIdList } from "../domain/types.js";
import type { DownloadClientRegistry } from "../services/download-clients/index.js";
import type { LibraryService } from "../services/library.js";
import type { MetadataService } from "../services/metadata/index.js";
import type { ProwlarrClient } from "../services/prowlarr.js";

export async function registerRoutes(
  app: FastifyInstance,
  library: LibraryService,
  prowlarr: ProwlarrClient,
  clients: DownloadClientRegistry,
  metadata: MetadataService
): Promise<void> {
  app.get("/api/health", async () => {
    const settings = library.getSettings();
    const [prow, downloadClients, meta] = await Promise.all([
      prowlarr.health(),
      clients.health(settings),
      metadata.health(settings),
    ]);
    return {
      status: "ok",
      service: "bookarr",
      prowlarr: prow,
      downloadClients,
      metadata: meta,
      stats: library.stats(),
    };
  });

  app.get("/api/stats", async () => library.stats());

  app.get("/api/authors", async () => library.listAuthors());

  app.get<{ Querystring: { wanted?: string; monitored?: string } }>("/api/books", async (req) => {
    const wanted = req.query.wanted === undefined ? undefined : req.query.wanted === "true";
    const monitored =
      req.query.monitored === undefined ? undefined : req.query.monitored === "true";
    return library.listBooks({ wanted, monitored });
  });

  app.get<{ Params: { id: string } }>("/api/books/:id", async (req, reply) => {
    const book = library.getBook(Number(req.params.id));
    if (!book) return reply.code(404).send({ error: "Book not found" });
    return book;
  });

  app.post("/api/books", async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1),
        authorName: z.string().min(1),
        overview: z.string().nullable().optional(),
        asin: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
        narrator: z.string().nullable().optional(),
        coverUrl: z.string().nullable().optional(),
        runtimeMinutes: z.number().int().nullable().optional(),
        monitored: z.boolean().optional(),
        wanted: z.boolean().optional(),
        qualityProfileId: z.number().int().optional(),
      })
      .parse(req.body);
    const book = library.upsertAudiobook(body);
    return reply.code(201).send(book);
  });

  app.patch<{ Params: { id: string } }>("/api/books/:id", async (req, reply) => {
    const body = z
      .object({
        monitored: z.boolean().optional(),
        wanted: z.boolean().optional(),
        status: z.enum(["wanted", "monitored", "downloading", "available", "missing"]).optional(),
        path: z.string().nullable().optional(),
      })
      .parse(req.body);
    const book = library.updateBookFlags(Number(req.params.id), body);
    if (!book) return reply.code(404).send({ error: "Book not found" });
    return book;
  });

  app.post<{ Params: { id: string } }>("/api/books/:id/enrich", async (req, reply) => {
    const book = library.getBook(Number(req.params.id));
    if (!book) return reply.code(404).send({ error: "Book not found" });
    const settings = library.getSettings();
    const q = `${book.title} ${book.authorName ?? ""}`.trim();
    const { results, providers } = await metadata.search(q, settings, { limit: 5 });
    const match =
      results.find(
        (r) =>
          r.title.toLowerCase() === book.title.toLowerCase() ||
          r.title.toLowerCase().includes(book.title.toLowerCase().slice(0, 20))
      ) ?? results[0];
    if (!match) {
      return reply.code(404).send({ error: "No metadata match", providers });
    }
    const updated = library.applyMetadata(book.id, {
      overview: match.overview,
      asin: match.asin,
      isbn: match.isbn,
      narrator: match.narrator,
      coverUrl: match.coverUrl,
      runtimeMinutes: match.runtimeMinutes,
    });
    return { book: updated, match, providers };
  });

  app.get("/api/quality-profiles", async () => library.listQualityProfiles());

  app.get<{ Querystring: { status?: string } }>("/api/requests", async (req) => {
    const status = req.query.status as "pending" | "approved" | "denied" | undefined;
    return library.listRequests(status);
  });

  app.post("/api/requests", async (req, reply) => {
    const body = z
      .object({
        title: z.string().min(1),
        authorName: z.string().min(1),
        overview: z.string().nullable().optional(),
        asin: z.string().nullable().optional(),
        isbn: z.string().nullable().optional(),
        narrator: z.string().nullable().optional(),
        coverUrl: z.string().nullable().optional(),
        requesterName: z.string().min(1).default("anonymous"),
      })
      .parse(req.body);
    const created = library.createRequest(body);
    return reply.code(201).send(created);
  });

  app.post<{ Params: { id: string } }>("/api/requests/:id/approve", async (req, reply) => {
    const updated = await library.approveRequest(Number(req.params.id));
    if (!updated) return reply.code(404).send({ error: "Request not found" });
    return updated;
  });

  app.post<{ Params: { id: string } }>("/api/requests/:id/deny", async (req, reply) => {
    const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
    const updated = library.denyRequest(Number(req.params.id), body.reason);
    if (!updated) return reply.code(404).send({ error: "Request not found" });
    return updated;
  });

  app.get("/api/indexers", async () => prowlarr.listIndexers());

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return [];
    return library.searchReleases(q);
  });

  app.get<{ Querystring: { q?: string; limit?: string } }>("/api/metadata/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return { results: [], cached: false, providers: [] };
    const limit = req.query.limit ? Number(req.query.limit) : 8;
    const settings = library.getSettings();
    return metadata.search(q, settings, { limit });
  });

  app.get("/api/metadata/health", async () => metadata.health(library.getSettings()));

  app.post("/api/grab", async (req, reply) => {
    const body = z
      .object({
        audiobookId: z.number().int().optional().nullable(),
        release: z.object({
          guid: z.string(),
          title: z.string(),
          indexerId: z.number(),
          indexer: z.string(),
          protocol: z.string(),
          size: z.number(),
          downloadUrl: z.string().optional(),
          magnetUrl: z.string().optional(),
        }),
      })
      .parse(req.body);
    const job = await library.enqueueGrab(body);
    return reply.code(201).send(job);
  });

  app.get("/api/downloads", async () => library.listDownloads());

  app.post("/api/downloads/poll", async () => {
    const updated = await library.pollDownloads();
    return { polled: updated.length, jobs: library.listDownloads() };
  });

  app.get("/api/download-clients", async () => {
    const settings = library.getSettings();
    return clients.health(settings);
  });

  app.get("/api/settings", async () => library.publicSettings());

  app.put("/api/settings", async (req) => {
    const secretKeys = [
      "prowlarrApiKey",
      "qbittorrentPassword",
      "sabnzbdApiKey",
      "hardcoverApiKey",
    ] as const;
    const body = z
      .object({
        prowlarrUrl: z.string().optional(),
        prowlarrApiKey: z.string().optional(),
        prowlarrIndexerIds: z.union([z.array(z.number().int().positive()), z.string()]).optional(),
        prowlarrCategories: z.union([z.array(z.number().int().positive()), z.string()]).optional(),
        libraryRoot: z.string().optional(),
        qualityProfileId: z.number().int().optional(),
        autoSearchOnApprove: z.boolean().optional(),
        downloadClientMode: z.enum(["mock", "auto"]).optional(),
        qbittorrentUrl: z.string().optional(),
        qbittorrentUsername: z.string().optional(),
        qbittorrentPassword: z.string().optional(),
        qbittorrentCategory: z.string().optional(),
        sabnzbdUrl: z.string().optional(),
        sabnzbdApiKey: z.string().optional(),
        sabnzbdCategory: z.string().optional(),
        metadataMode: z.enum(["mock", "auto"]).optional(),
        hardcoverApiKey: z.string().optional(),
        metadataCacheTtlHours: z.number().int().positive().optional(),
        downloadPollMs: z.number().int().positive().optional(),
        mockDownloadMs: z.number().int().positive().optional(),
        logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
        clearSecrets: z.array(z.enum(secretKeys)).optional(),
      })
      .parse(req.body);

    const { clearSecrets, prowlarrIndexerIds, prowlarrCategories, ...rest } = body;
    const patch = { ...rest } as Record<string, unknown>;
    if (prowlarrIndexerIds !== undefined) {
      patch.prowlarrIndexerIds = parseIdList(prowlarrIndexerIds);
    }
    if (prowlarrCategories !== undefined) {
      patch.prowlarrCategories = parseIdList(prowlarrCategories);
    }
    for (const secret of secretKeys) {
      if (patch[secret] === "••••••••") delete patch[secret];
      // Empty string without clearSecrets means "keep existing"
      if (typeof patch[secret] === "string" && !(patch[secret] as string).trim()) {
        delete patch[secret];
      }
    }

    library.updateSettings(patch, { clearSecrets });
    return library.publicSettings();
  });

  app.post("/api/settings/test", async () => {
    const settings = library.getSettings();
    const [prowlarrHealth, downloadClients, meta] = await Promise.all([
      prowlarr.health(),
      clients.health(settings),
      metadata.health(settings),
    ]);
    return { prowlarr: prowlarrHealth, downloadClients, metadata: meta };
  });
}
