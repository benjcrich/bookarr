import { useState, type FormEvent } from "react";
import { bookarrApi, type ProwlarrRelease } from "../api/client";

function formatSize(n: number) {
  if (!n) return "—";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(n / 1e6).toFixed(0)} MB`;
}

export function AdminSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProwlarrRelease[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const data = await bookarrApi.search(q);
      setResults(data);
      if (!data.length) setMessage("No releases found.");
      else setMessage(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function grab(release: ProwlarrRelease) {
    setError(null);
    try {
      const job = await bookarrApi.grab(release);
      setMessage(`Grabbed via pipeline: ${job.title} (${job.status})`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1 className="page-title">Search / Grab</h1>
      <p className="page-lead">
        Search indexers through Prowlarr (or mock fallback) and enqueue a grab.
      </p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}
      <div className="panel">
        <form className="search-bar" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Title, author, ASIN…"
            required
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </form>
        {results.length === 0 ? (
          <div className="empty">Run a search to see indexer releases.</div>
        ) : (
          results.map((r) => (
            <div className="row" key={r.guid}>
              <div>
                <h3>{r.title}</h3>
                <div className="meta">
                  {r.indexer} · {r.protocol} · {formatSize(r.size)}
                  {r.seeders != null ? ` · ${r.seeders} seeders` : ""}
                </div>
              </div>
              <div>
                <span className="badge">{r.protocol}</span>
              </div>
              <div className="actions">
                <button className="btn primary" type="button" onClick={() => grab(r)}>
                  Grab
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
