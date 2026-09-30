import { useEffect, useState, type FormEvent } from "react";
import { bookarrApi, type Audiobook } from "../api/client";

export function AdminLibrary() {
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [wantedOnly, setWantedOnly] = useState(false);
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(wanted = wantedOnly) {
    const data = await bookarrApi.books(wanted ? { wanted: true } : undefined);
    setBooks(data);
  }

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, []);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await bookarrApi.addBook({ title, authorName, wanted: true, monitored: true });
      setTitle("");
      setAuthorName("");
      setMessage("Added to library as wanted/monitored.");
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function toggleWanted(book: Audiobook) {
    await bookarrApi.patchBook(book.id, { wanted: !book.wanted, monitored: true });
    await load();
  }

  return (
    <>
      <h1 className="page-title">Library</h1>
      <p className="page-lead">Track audiobooks, monitoring, and wanted state.</p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <h2>Add audiobook</h2>
        </div>
        <form className="form-grid two" onSubmit={onAdd}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Author
            <input value={authorName} onChange={(e) => setAuthorName(e.target.value)} required />
          </label>
          <div>
            <button className="btn primary" type="submit">
              Add wanted
            </button>
          </div>
        </form>
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
            <div className="row" key={b.id}>
              <div>
                <h3>{b.title}</h3>
                <div className="meta">
                  {b.authorName}
                  {b.narrator ? ` · ${b.narrator}` : ""}
                </div>
              </div>
              <div>
                <span className={`badge ${b.status}`}>{b.status}</span>{" "}
                {b.wanted && <span className="badge wanted">wanted</span>}{" "}
                {b.monitored && <span className="badge">monitored</span>}
              </div>
              <div className="actions">
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
