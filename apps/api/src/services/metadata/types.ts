import type { MetadataResult } from "../../domain/types.js";

export interface MetadataProviderAdapter {
  readonly name: "openlibrary" | "hardcover" | "mock";
  search(query: string, limit?: number): Promise<MetadataResult[]>;
}
