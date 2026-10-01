import type { AppSettings } from "../../domain/types.js";
import { MockDownloadClient } from "./mock.js";
import { QBittorrentClient } from "./qbittorrent.js";
import { SabnzbdClient } from "./sabnzbd.js";
import type { DownloadClientAdapter } from "./types.js";

export class DownloadClientRegistry {
  private mockTorrent = new MockDownloadClient("torrent");
  private mockUsenet = new MockDownloadClient("usenet");
  private qbit: QBittorrentClient;
  private sab: SabnzbdClient;

  constructor(settings: AppSettings) {
    this.qbit = new QBittorrentClient({
      url: settings.qbittorrentUrl,
      username: settings.qbittorrentUsername,
      password: settings.qbittorrentPassword,
      category: settings.qbittorrentCategory,
    });
    this.sab = new SabnzbdClient({
      url: settings.sabnzbdUrl,
      apiKey: settings.sabnzbdApiKey,
      category: settings.sabnzbdCategory,
    });
  }

  updateFromSettings(settings: AppSettings): void {
    this.qbit.updateConfig({
      url: settings.qbittorrentUrl,
      username: settings.qbittorrentUsername,
      password: settings.qbittorrentPassword,
      category: settings.qbittorrentCategory,
    });
    this.sab.updateConfig({
      url: settings.sabnzbdUrl,
      apiKey: settings.sabnzbdApiKey,
      category: settings.sabnzbdCategory,
    });
    this.mockTorrent.setDurationMs(settings.mockDownloadMs);
    this.mockUsenet.setDurationMs(settings.mockDownloadMs);
    if (process.env.BOOKARR_MOCK_DOWNLOAD_ROOT) {
      this.mockTorrent.setOutputRoot(process.env.BOOKARR_MOCK_DOWNLOAD_ROOT);
      this.mockUsenet.setOutputRoot(process.env.BOOKARR_MOCK_DOWNLOAD_ROOT);
    }
  }

  forProtocol(protocol: string, mode: "mock" | "auto"): DownloadClientAdapter {
    const p = protocol.toLowerCase();
    if (p === "usenet") {
      if (mode === "auto" && this.sab.configured) return this.sab;
      return this.mockUsenet;
    }
    // torrent / unknown → torrent path
    if (mode === "auto" && this.qbit.configured) return this.qbit;
    return this.mockTorrent;
  }

  async health(settings: AppSettings) {
    const torrent = await this.forProtocol("torrent", settings.downloadClientMode).health();
    const usenet = await this.forProtocol("usenet", settings.downloadClientMode).health();
    return {
      mode: settings.downloadClientMode,
      torrent: {
        kind: this.forProtocol("torrent", settings.downloadClientMode).kind,
        ...torrent,
      },
      usenet: {
        kind: this.forProtocol("usenet", settings.downloadClientMode).kind,
        ...usenet,
      },
    };
  }

  /** Exposed for tests */
  getMockTorrent(): MockDownloadClient {
    return this.mockTorrent;
  }
}
