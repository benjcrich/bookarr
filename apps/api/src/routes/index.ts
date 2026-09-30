import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { LibraryService } from "../services/library.js";
import type { ProwlarrClient } from "../services/prowlarr.js";

export async function registerRoutes(
  app: FastifyInstance,
  library: LibraryService,
  prowlarr: ProwlarrClient
): Promise<void> {
  app.get("/api/health", async () => {
    const prow = await prowlarr.health();
    return {
      status: "ok",
      service: "bookarr",
      prowlarr: prow,
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
        narrator: z.string().nullable().optional(),
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

  app.get("/api/quality-profiles", async () => library.listQualityProfiles());

  // --- Requests (end-user + admin) ---
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
        narrator: z.string().nullable().optional(),
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

  // --- Prowlarr / search / grab ---
  app.get("/api/indexers", async () => prowlarr.listIndexers());

  app.get<{ Querystring: { q?: string } }>("/api/search", async (req) => {
    const q = (req.query.q ?? "").trim();
    if (!q) return [];
    return prowlarr.search(q);
  });

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

  app.get("/api/settings", async () => {
    const s = library.getSettings();
    return {
      ...s,
      prowlarrApiKey: s.prowlarrApiKey ? "••••••••" : "",
      prowlarrApiKeySet: Boolean(s.prowlarrApiKey),
    };
  });

  app.put("/api/settings", async (req) => {
    const body = z
      .object({
        prowlarrUrl: z.string().optional(),
        prowlarrApiKey: z.string().optional(),
        libraryRoot: z.string().optional(),
        qualityProfileId: z.number().int().optional(),
        autoSearchOnApprove: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = library.updateSettings(body);
    return {
      ...updated,
      prowlarrApiKey: updated.prowlarrApiKey ? "••••••••" : "",
      prowlarrApiKeySet: Boolean(updated.prowlarrApiKey),
    };
  });
}
