import { useEffect, useState } from "react";
import { bookarrApi, type DownloadClientsHealth, type Stats } from "../api/client";

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [prowlarr, setProwlarr] = useState<{ mode: string; detail: string } | null>(null);
  const [clients, setClients] = useState<DownloadClientsHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bookarrApi
      .health()
      .then((h) => {
        setStats(h.stats);
        setProwlarr(h.prowlarr);
        setClients(h.downloadClients);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-lead">
        Library overview, pending requests, Prowlarr, and download clients.
      </p>
      {error && <p className="flash error">{error}</p>}
      {prowlarr && (
        <p className="flash">
          Prowlarr mode: <strong>{prowlarr.mode}</strong> — {prowlarr.detail}
        </p>
      )}
      {clients && (
        <p className="flash">
          Download clients ({clients.mode}): torrent <strong>{clients.torrent.kind}</strong> —{" "}
          {clients.torrent.detail}; usenet <strong>{clients.usenet.kind}</strong> —{" "}
          {clients.usenet.detail}
        </p>
      )}
      {stats && (
        <div className="grid-stats">
          <div className="stat">
            <strong>{stats.books}</strong>
            <span>Audiobooks</span>
          </div>
          <div className="stat">
            <strong>{stats.wanted}</strong>
            <span>Wanted</span>
          </div>
          <div className="stat">
            <strong>{stats.pendingRequests}</strong>
            <span>Pending requests</span>
          </div>
          <div className="stat">
            <strong>{stats.activeDownloads ?? stats.downloads}</strong>
            <span>Active downloads</span>
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-head">
          <h2>Pipeline</h2>
        </div>
        <div className="empty">
          Request → approve → wanted/monitored → Prowlarr search → grab → qBittorrent/SABnzbd (or
          mock) → poll → import into library root.
        </div>
      </div>
    </>
  );
}
