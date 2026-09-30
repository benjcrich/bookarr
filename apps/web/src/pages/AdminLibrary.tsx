import { useEffect, useState, type FormEvent } from "react";
import { bookarrApi, type Audiobook, type MetadataResult } from "../api/client";

export function AdminLibrary() {
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [wantedOnly, setWantedOnly] = useState(false);
  const [metaQ, setMetaQ] = useState("");
  const [metaHits, setMetaHits] = useState<MetadataResult[]>([]);
  const [metaInfo, setMetaInfo] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(wanted = wantedOnly) {
    const data = await bookarrApi.books(wanted ? { wanted: true } : undefined);
    setBooks(data);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function onMetaSearch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await bookarrApi.metadataSearch(metaQ);
      setMetaHits(res.results);
      setMetaInfo(
        `${res.cached ? "cached" : "live"} · providers: ${res.providers.join(", ") || "—"}`
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addFromMeta(m: MetadataResult) {
    setError(null);
    try {
      await bookarrApi.addBook({
        title: m.title,
        authorName: m.authorName,
        overview: m.overview,
        asin: m.asin,
        isbn: m.isbn,
        narrator: m.narrator,
        coverUrl: m.coverUrl,
        runtimeMinutes: m.runtimeMinutes,
        wanted: true,
        monitored: true,
      });
      setMessage(`Added “${m.title}” from ${m.provider}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleWanted(book: Audiobook) {
    await bookarrApi.patchBook(book.id, { wanted: !book.wanted, monitored: true });
    await load();
  }

  async function enrich(book: Audiobook) {
    setError(null);
    try {
      const res = await bookarrApi.enrichBook(book.id);
      setMessage(`Enriched “${res.book.title}” via ${res.match.provider}.`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1 className="page-title">Library</h1>
      <p className="page-lead">Track audiobooks — search metadata providers, then add as wanted.</p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <h2>Metadata lookup</h2>
          {metaInfo && <span className="meta">{metaInfo}</span>}
        </div>
        <form className="search-bar" onSubmit={onMetaSearch}>
          <input
            value={metaQ}
            onChange={(e) => setMetaQ(e.target.value)}
            placeholder="Title, author, ISBN…"
            required
          />
          <button className="btn primary" type="submit">
            Search metadata
          </button>
        </form>
        {metaHits.length === 0 ? (
          <div className="empty">Search Open Library / Hardcover (or mock) to add with covers.</div>
        ) : (
          metaHits.map((m) => (
            <div className="row meta-row" key={`${m.provider}-${m.providerId}`}>
              <div className="meta-cover">
                {m.coverUrl ? (
                  <img src={m.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div className="meta-cover-empty" />
                )}
              </div>
              <div>
                <h3>{m.title}</h3>
                <div className="meta">
                  {m.authorName}
                  {m.narrator ? ` · ${m.narrator}` : ""}
                  {m.publishedYear ? ` · ${m.publishedYear}` : ""}
                  {m.isbn ? ` · ISBN ${m.isbn}` : ""}
                  {m.asin ? ` · ASIN ${m.asin}` : ""}
                </div>
                {m.overview && <div className="meta overview-clip">{m.overview}</div>}
              </div>
              <div>
                <span className="badge">{m.provider}</span>
              </div>
              <div className="actions">
                <button className="btn primary" type="button" onClick={() => addFromMeta(m)}>
                  Add wanted
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Collection</h2>
          <label style={{ color: "var(--ink)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <input
              type="checkbox"
              checked={wantedOnly}
              onChange={async (e) => {
                const v = e.target.checked;
                setWantedOnly(v);
                await load(v);
              }}
            />
            Wanted only
          </label>
        </div>
        {books.length === 0 ? (
          <div className="empty">No audiobooks yet.</div>
        ) : (
          books.map((b) => (
            <div className="row meta-row" key={b.id}>
              <div className="meta-cover">
                {b.coverUrl ? (
                  <img src={b.coverUrl} alt="" loading="lazy" />
                ) : (
                  <div className="meta-cover-empty" />
                )}
              </div>
              <div>
                <h3>{b.title}</h3>
                <div className="meta">
                  {b.authorName}
                  {b.narrator ? ` · ${b.narrator}` : ""}
                  {b.isbn ? ` · ISBN ${b.isbn}` : ""}
                  {b.runtimeMinutes ? ` · ${b.runtimeMinutes} min` : ""}
                </div>
              </div>
              <div>
                <span className={`badge ${b.status}`}>{b.status}</span>{" "}
                {b.wanted && <span className="badge wanted">wanted</span>}
              </div>
              <div className="actions">
                <button className="btn" type="button" onClick={() => enrich(b)}>
                  Enrich
                </button>
                <button className="btn" type="button" onClick={() => toggleWanted(b)}>
                  {b.wanted ? "Unwant" : "Want"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
