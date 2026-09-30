import { useEffect, useState, type FormEvent } from "react";
import { bookarrApi } from "../api/client";

export function AdminSettings() {
  const [prowlarrUrl, setProwlarrUrl] = useState("");
  const [prowlarrApiKey, setProwlarrApiKey] = useState("");
  const [libraryRoot, setLibraryRoot] = useState("");
  const [autoSearchOnApprove, setAutoSearchOnApprove] = useState(true);
  const [keySet, setKeySet] = useState(false);
  const [indexers, setIndexers] = useState<Array<{ id: number; name: string; protocol: string; enable: boolean }>>(
    []
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([bookarrApi.settings(), bookarrApi.indexers()])
      .then(([s, idx]) => {
        setProwlarrUrl(s.prowlarrUrl);
        setLibraryRoot(s.libraryRoot);
        setAutoSearchOnApprove(s.autoSearchOnApprove);
        setKeySet(s.prowlarrApiKeySet);
        setIndexers(idx);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {
        prowlarrUrl,
        libraryRoot,
        autoSearchOnApprove,
      };
      if (prowlarrApiKey.trim()) body.prowlarrApiKey = prowlarrApiKey.trim();
      await bookarrApi.updateSettings(body);
      setMessage("Settings saved.");
      setProwlarrApiKey("");
      const idx = await bookarrApi.indexers();
      setIndexers(idx);
      const s = await bookarrApi.settings();
      setKeySet(s.prowlarrApiKeySet);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-lead">Prowlarr connection and library defaults.</p>
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="panel-head">
          <h2>Configuration</h2>
        </div>
        <form className="form-grid" onSubmit={onSave}>
          <label>
            Prowlarr URL
            <input
              value={prowlarrUrl}
              onChange={(e) => setProwlarrUrl(e.target.value)}
              placeholder="http://prowlarr:9696"
            />
          </label>
          <label>
            Prowlarr API key {keySet ? "(set — leave blank to keep)" : ""}
            <input
              value={prowlarrApiKey}
              onChange={(e) => setProwlarrApiKey(e.target.value)}
              placeholder="••••••••"
              type="password"
              autoComplete="off"
            />
          </label>
          <label>
            Library root
            <input value={libraryRoot} onChange={(e) => setLibraryRoot(e.target.value)} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ink)" }}>
            <input
              type="checkbox"
              checked={autoSearchOnApprove}
              onChange={(e) => setAutoSearchOnApprove(e.target.checked)}
            />
            Auto-search & grab on request approve
          </label>
          <div>
            <button className="btn primary" type="submit">
              Save
            </button>
          </div>
        </form>
      </div>
      <div className="panel">
        <div className="panel-head">
          <h2>Indexers (via Prowlarr)</h2>
        </div>
        {indexers.length === 0 ? (
          <div className="empty">No indexers returned.</div>
        ) : (
          indexers.map((i) => (
            <div className="row" key={i.id}>
              <div>
                <h3>{i.name}</h3>
                <div className="meta">id {i.id}</div>
              </div>
              <div>
                <span className="badge">{i.protocol}</span>{" "}
                <span className={`badge ${i.enable ? "available" : "denied"}`}>
                  {i.enable ? "enabled" : "disabled"}
                </span>
              </div>
              <div />
            </div>
          ))
        )}
      </div>
    </>
  );
}
