import type { MetadataResult } from "../../domain/types.js";
import type { MetadataProviderAdapter } from "./types.js";

interface OlDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  first_sentence?: string[] | string;
  cover_i?: number;
  isbn?: string[];
  id_amazon?: string[];
  number_of_pages_median?: number;
  first_publish_year?: number;
}

/**
 * Open Library search — no API key required.
 * @see https://openlibrary.org/dev/docs/api/search
 */
export class OpenLibraryProvider implements MetadataProviderAdapter {
  readonly name = "openlibrary" as const;

  async search(query: string, limit = 8): Promise<MetadataResult[]> {
    const q = query.trim();
    if (!q) return [];
    const fields = [
      "key",
      "title",
      "author_name",
      "first_sentence",
      "cover_i",
      "isbn",
      "id_amazon",
      "number_of_pages_median",
      "first_publish_year",
    ].join(",");
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=${limit}&fields=${fields}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Bookarr/0.1 (audiobook-arr)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Open Library HTTP ${res.status}`);
    const data = (await res.json()) as { docs?: OlDoc[] };
    return (data.docs ?? []).map(mapDoc).filter((m) => m.title);
  }
}

function mapDoc(doc: OlDoc): MetadataResult {
  const isbn = doc.isbn?.find((i) => i.length >= 10) ?? null;
  const asin = doc.id_amazon?.[0] ?? null;
  const sentence = Array.isArray(doc.first_sentence)
    ? doc.first_sentence[0]
    : doc.first_sentence;
  return {
    provider: "openlibrary",
    providerId: String(doc.key ?? isbn ?? doc.title ?? crypto.randomUUID()),
    title: String(doc.title ?? "Untitled"),
    authorName: doc.author_name?.[0] ?? "Unknown Author",
    overview: sentence ? String(sentence) : null,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
      : isbn
        ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
        : null,
    narrator: null,
    // OL doesn't expose audiobook runtime; leave null
    runtimeMinutes: null,
    asin,
    isbn,
    publishedYear: doc.first_publish_year ?? null,
  };
}
