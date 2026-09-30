import { useState, type FormEvent } from "react";
import {
  bookarrApi,
  type Audiobook,
  type MetadataResult,
  type ProwlarrRelease,
} from "../api/client";

export function RequestHome() {
  const [q, setQ] = useState("");
  const [name, setName] = useState(() => localStorage.getItem("bookarr.requester") || "");
  const [libraryHits, setLibraryHits] = useState<Audiobook[]>([]);
  const [metaHits, setMetaHits] = useState<MetadataResult[]>([]);
  const [releases, setReleases] = useState<ProwlarrRelease[]>([]);
  const [selected, setSelected] = useState<MetadataResult | null>(null);
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const [books, meta, search] = await Promise.all([
        bookarrApi.books(),
        bookarrApi.metadataSearch(q),
        bookarrApi.search(q),
      ]);
      const needle = q.toLowerCase();
      setLibraryHits(
        books.filter(
          (b) =>
            b.title.toLowerCase().includes(needle) ||
            (b.authorName ?? "").toLowerCase().includes(needle)
        )
      );
      setMetaHits(meta.results);
      setReleases(search);
      if (!title) setTitle(q);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function useMeta(m: MetadataResult) {
    setSelected(m);
    setTitle(m.title);
    setAuthorName(m.authorName);
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
        authorName: authorName.trim() || selected?.authorName || "Unknown Author",
        overview: selected?.overview ?? null,
        asin: selected?.asin ?? null,
        isbn: selected?.isbn ?? null,
        narrator: selected?.narrator ?? null,
        coverUrl: selected?.coverUrl ?? null,
        requesterName: name.trim(),
      });
      setMessage(`Request #${req.id} submitted for “${req.title}”. An admin will review it.`);
      setTitle("");
      setAuthorName("");
      setSelected(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function prefillFromRelease(r: ProwlarrRelease) {
    setTitle(r.title.replace(/\s*\[.*?\]\s*/g, " ").trim());
    setSelected(null);
  }

  return (
    <>
      <h1 className="page-title">Request an audiobook</h1>
      <p className="page-lead">
        Search metadata and the library, then send a request for admin approval.
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
              <div className="row meta-row" key={b.id}>
                <div className="meta-cover">
                  {b.coverUrl ? <img src={b.coverUrl} alt="" loading="lazy" /> : <div className="meta-cover-empty" />}
                </div>
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
        {metaHits.length > 0 && (
          <>
            <div className="panel-head">
              <h2>Metadata matches</h2>
            </div>
            {metaHits.map((m) => (
              <div className="row meta-row" key={`${m.provider}-${m.providerId}`}>
                <div className="meta-cover">
                  {m.coverUrl ? <img src={m.coverUrl} alt="" loading="lazy" /> : <div className="meta-cover-empty" />}
                </div>
                <div>
                  <h3>{m.title}</h3>
                  <div className="meta">
                    {m.authorName}
                    {m.isbn ? ` · ISBN ${m.isbn}` : ""}
                  </div>
                </div>
                <div>
                  <span className="badge">{m.provider}</span>
                </div>
                <div className="actions">
                  <button className="btn primary" type="button" onClick={() => useMeta(m)}>
                    Request this
                  </button>
                </div>
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
          {selected && <span className="meta">Using {selected.provider} metadata</span>}
        </div>
        <form className="form-grid two" onSubmit={submitRequest}>
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Author
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Optional"
            />
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
