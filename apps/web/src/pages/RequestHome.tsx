import { useState, type FormEvent } from "react";
import { bookarrApi, type Audiobook, type ProwlarrRelease } from "../api/client";

export function RequestHome() {
  const [q, setQ] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("bookarr.requester") || "");
  const [libraryHits, setLibraryHits] = useState<Audiobook[]>([]);
  const [releases, setReleases] = useState<ProwlarrRelease[]>([]);
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const [books, search] = await Promise.all([bookarrApi.books(), bookarrApi.search(q)]);
      const needle = q.toLowerCase();
      setLibraryHits(
        books.filter(
          (b) =>
            b.title.toLowerCase().includes(needle) ||
            (b.authorName ?? "").toLowerCase().includes(needle)
        )
      );
      setReleases(search);
      if (!title) setTitle(q);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function submitRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Enter your name so admins know who asked.");
      return;
    }
    localStorage.setItem("bookarr.requester", name.trim());
    try {
      const req = await bookarrApi.createRequest({
        title: title.trim(),
        authorName: authorName.trim() || "Unknown Author",
        requesterName: name.trim(),
      });
      setMessage(`Request #${req.id} submitted for “${req.title}”. An admin will review it.`);
      setTitle("");
      setAuthorName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function prefillFromRelease(r: ProwlarrRelease) {
    setTitle(r.title.replace(/\s*\[.*?\]\s*/g, " ").trim());
  }

  return (
    <>
      <h1 className="page-title">Request an audiobook</h1>
      <p className="page-lead">
        Search the library and indexers, then send a request for admin approval.
      </p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="search-bar" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles…"
            required
          />
          <button className="btn primary" type="submit">
            Search
          </button>
        </form>
        {libraryHits.length > 0 && (
          <>
            <div className="panel-head">
              <h2>Already in library</h2>
            </div>
            {libraryHits.map((b) => (
              <div className="row" key={b.id}>
                <div>
                  <h3>{b.title}</h3>
                  <div className="meta">{b.authorName}</div>
                </div>
                <div>
                  <span className={`badge ${b.status}`}>{b.status}</span>
                </div>
                <div className="meta">No need to request</div>
              </div>
            ))}
          </>
        )}
        {releases.length > 0 && (
          <>
            <div className="panel-head">
              <h2>Indexer hints</h2>
            </div>
            {releases.map((r) => (
              <div className="row" key={r.guid}>
                <div>
                  <h3>{r.title}</h3>
                  <div className="meta">
                    {r.indexer} · {r.protocol}
                  </div>
                </div>
                <div>
                  <span className="badge">{r.protocol}</span>
                </div>
                <div className="actions">
                  <button className="btn" type="button" onClick={() => prefillFromRelease(r)}>
                    Use title
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Submit request</h2>
        </div>
        <form className="form-grid two" onSubmit={submitRequest}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Author
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Optional" />
          </label>
          <label style={{ gridColumn: "1 / -1" }}>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <div>
            <button className="btn primary" type="submit">
              Send request
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
