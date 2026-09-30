import type { MetadataResult } from "../../domain/types.js";
import type { MetadataProviderAdapter } from "./types.js";

/**
 * Hardcover GraphQL search (optional; requires API token).
 * Falls back silently when unconfigured or the API rejects the query.
 * @see https://docs.hardcover.app
 */
export class HardcoverProvider implements MetadataProviderAdapter {
  readonly name = "hardcover" as const;

  constructor(private apiKey: string) {}

  updateApiKey(key: string): void {
    this.apiKey = key;
  }

  get configured(): boolean {
    return Boolean(this.apiKey?.trim());
  }

  async search(query: string, limit = 8): Promise<MetadataResult[]> {
    if (!this.configured) return [];
    const q = query.trim();
    if (!q) return [];

    const gql = `
      query SearchBooks($query: String!) {
        search(query: $query, query_type: "Book", per_page: ${Math.min(limit, 20)}, page: 1) {
          results
        }
      }
    `;

    const res = await fetch("https://api.hardcover.app/v1/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey.startsWith("Bearer ")
          ? this.apiKey
          : `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ query: gql, variables: { query: q } }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Hardcover HTTP ${res.status}`);
    const payload = (await res.json()) as {
      data?: { search?: { results?: unknown } };
      errors?: Array<{ message: string }>;
    };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((e) => e.message).join("; "));
    }

    const raw = payload.data?.search?.results;
    const hits = normalizeHits(raw).slice(0, limit);
    return hits.map(mapHit);
  }
}

function normalizeHits(raw: unknown): Array<Record<string, unknown>> {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed as Array<Record<string, unknown>>;
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { hits?: unknown }).hits)) {
        return (parsed as { hits: Array<Record<string, unknown>> }).hits;
      }
    } catch {
      return [];
    }
  }
  if (typeof raw === "object" && Array.isArray((raw as { hits?: unknown }).hits)) {
    return (raw as { hits: Array<Record<string, unknown>> }).hits;
  }
  return [];
}

function mapHit(hit: Record<string, unknown>): MetadataResult {
  const document = (hit.document as Record<string, unknown> | undefined) ?? hit;
  const title = String(document.title ?? hit.title ?? "Untitled");
  const authorNames = document.author_names;
  const firstAuthorName = Array.isArray(authorNames) ? String(authorNames[0] ?? "") : "";
  let contributionName = "";
  if (Array.isArray(document.contributions) && document.contributions[0]) {
    const c0 = document.contributions[0] as { author?: { name?: string } };
    contributionName = c0.author?.name ?? "";
  }
  const author =
    firstAuthorName ||
    (document.author ? String(document.author) : "") ||
    contributionName ||
    "Unknown Author";
  const isbn13 = document.isbn_13 ?? document.isbn13 ?? document.isbn;
  const isbn = Array.isArray(isbn13) ? String(isbn13[0] ?? "") : isbn13 ? String(isbn13) : null;
  const imageObj = document.image;
  const imageUrl =
    imageObj && typeof imageObj === "object" && "url" in imageObj
      ? String((imageObj as { url?: string }).url ?? "")
      : document.cover_url
        ? String(document.cover_url)
        : typeof imageObj === "string"
          ? imageObj
          : null;
  const description =
    document.description ?? document.cached_description ?? document.subtitle ?? null;
  return {
    provider: "hardcover",
    providerId: String(document.id ?? hit.id ?? title),
    title,
    authorName: author,
    overview: description ? String(description).slice(0, 2000) : null,
    coverUrl: imageUrl || null,
    narrator: null,
    runtimeMinutes: null,
    asin: document.asin ? String(document.asin) : null,
    isbn: isbn || null,
    publishedYear: document.release_year
      ? Number(document.release_year)
      : document.first_publish_year
        ? Number(document.first_publish_year)
        : null,
  };
}
