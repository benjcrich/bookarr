import type { MetadataResult } from "../../domain/types.js";
import type { MetadataProviderAdapter } from "./types.js";

const CATALOG: MetadataResult[] = [
  {
    provider: "mock",
    providerId: "mock-wok",
    title: "The Way of Kings",
    authorName: "Brandon Sanderson",
    overview:
      "Roshar is a world of stone and storms. The Way of Kings begins The Stormlight Archive.",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780765326355-L.jpg",
    narrator: "Kate Reading / Michael Kramer",
    runtimeMinutes: 2734,
    asin: "B003P9X5VM",
    isbn: "9780765326355",
    publishedYear: 2010,
  },
  {
    provider: "mock",
    providerId: "mock-mistborn",
    title: "Mistborn: The Final Empire",
    authorName: "Brandon Sanderson",
    overview: "In a world where ash falls from the sky, a street urchin joins a rebellion.",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780765311788-L.jpg",
    narrator: "Michael Kramer",
    runtimeMinutes: 1485,
    asin: "B002V0QUF2",
    isbn: "9780765311788",
    publishedYear: 2006,
  },
  {
    provider: "mock",
    providerId: "mock-asr",
    title: "All Systems Red",
    authorName: "Martha Wells",
    overview: "A Murderbot novella about a security unit that just wants to watch media.",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780765397539-L.jpg",
    narrator: "Kevin R. Free",
    runtimeMinutes: 211,
    asin: "B075DGHHQL",
    isbn: "9780765397539",
    publishedYear: 2017,
  },
  {
    provider: "mock",
    providerId: "mock-project-hail-mary",
    title: "Project Hail Mary",
    authorName: "Andy Weir",
    overview: "A lone astronaut must save humanity — and he doesn't even remember his own name.",
    coverUrl: "https://covers.openlibrary.org/b/isbn/9780593135204-L.jpg",
    narrator: "Ray Porter",
    runtimeMinutes: 970,
    asin: "B08G9PRS1K",
    isbn: "9780593135204",
    publishedYear: 2021,
  },
];

export class MockMetadataProvider implements MetadataProviderAdapter {
  readonly name = "mock" as const;

  async search(query: string, limit = 8): Promise<MetadataResult[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = CATALOG.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.authorName.toLowerCase().includes(q) ||
        (m.isbn ?? "").includes(q) ||
        (m.asin ?? "").toLowerCase().includes(q)
    );
    if (hits.length > 0) return hits.slice(0, limit);
    // Synthetic fallback so UI always has something to pick
    const synthetic: MetadataResult = {
      provider: "mock",
      providerId: `mock-${q.replace(/\s+/g, "-").slice(0, 40)}`,
      title: query.trim(),
      authorName: "Unknown Author",
      overview: `Mock metadata for “${query.trim()}” (providers unavailable or forced mock mode).`,
      coverUrl: null,
      narrator: null,
      runtimeMinutes: null,
      asin: null,
      isbn: null,
      publishedYear: null,
    };
    return [synthetic].slice(0, limit);
  }
}
