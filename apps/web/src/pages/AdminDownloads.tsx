import { useEffect, useState } from "react";
import { bookarrApi, type DownloadJob } from "../api/client";

export function AdminDownloads() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [clients, setClients] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  async function load() {
    const [list, health] = await Promise.all([bookarrApi.downloads(), bookarrApi.downloadClients()]);
    setJobs(list);
    setClients(
      `${health.mode} · torrent=${health.torrent.kind} (${health.torrent.detail}) · usenet=${health.usenet.kind} (${health.usenet.detail})`
    );
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  async function pollNow() {
    setBusy(true);
    setError(null);
    try {
      const res = await bookarrApi.pollDownloads();
      setJobs(res.jobs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function retryJob(id: number) {
    setRetryingId(id);
    setError(null);
    setMessage(null);
    try {
      const res = await bookarrApi.retryDownload(id);
      setJobs(await bookarrApi.downloads());
      setMessage(
        res.job.status === "failed"
          ? `Retry attempted for #${id} (still failed: ${res.job.error ?? "unknown"}).`
          : `Retry started for #${id} (attempt ${res.job.attempts}).`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <h1 className="page-title">Downloads</h1>
      <p className="page-lead">
        Active jobs from qBittorrent / SABnzbd (or mock clients). Failed jobs auto-retry with backoff;
        use Retry for an immediate re-attempt (e.g. after fixing volume permissions).
      </p>
      {clients && <p className="flash">{clients}</p>}
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}
      <div className="panel">
        <div className="panel-head">
          <h2>Jobs</h2>
          <button className="btn" type="button" onClick={pollNow} disabled={busy}>
            {busy ? "Polling…" : "Poll now"}
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="empty">No download jobs yet. Grab a release from Search.</div>
        ) : (
          jobs.map((j) => (
            <div className="row download-row" key={j.id}>
              <div>
                <h3>{j.title}</h3>
                <div className="meta">
                  {j.client ?? "—"} · {j.indexerName ?? "indexer"} · {j.protocol}
                  {j.externalId ? ` · ${j.externalId}` : ""}
                  {` · attempt ${j.attempts ?? 1}`}
                </div>
                {(j.status === "downloading" || j.status === "queued" || j.status === "grabbed") && (
                  <div className="progress" aria-label={`Progress ${j.progress}%`}>
                    <div className="progress-bar" style={{ width: `${Math.min(100, j.progress)}%` }} />
                  </div>
                )}
                {j.importPath && <div className="meta">Import: {j.importPath}</div>}
                {j.error && (
                  <div className="meta" style={{ color: "var(--danger)" }}>
                    {j.error}
                  </div>
                )}
                {j.status === "failed" && j.nextRetryAt && (
                  <div className="meta">Auto-retry at {new Date(j.nextRetryAt).toLocaleString()}</div>
                )}
              </div>
              <div>
                <span className={`badge ${j.status}`}>{j.status}</span>{" "}
                <span className="badge">{Math.round(j.progress)}%</span>
              </div>
              <div>
                <div className="meta">{new Date(j.createdAt).toLocaleString()}</div>
                {j.status === "failed" && (
                  <button
                    className="btn"
                    type="button"
                    style={{ marginTop: "0.5rem" }}
                    disabled={retryingId === j.id}
                    onClick={() => retryJob(j.id)}
                  >
                    {retryingId === j.id ? "Retrying…" : "Retry"}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
