import type { AppSettings } from "./types.js";

/** Shared defaults for tests / bootstrap stubs (no secrets). */
export function defaultSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    prowlarrUrl: "",
    prowlarrApiKey: "",
    prowlarrIndexerIds: [],
    prowlarrCategories: [],
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
    logLevel: "info",
    downloadRetryMaxAttempts: 5,
    downloadRetryBaseDelayMs: 10_000,
    remotePathMappings: [],
    importMode: "auto",
    ...overrides,
  };
}
