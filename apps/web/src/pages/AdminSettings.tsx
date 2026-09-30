import { useEffect, useState, type FormEvent } from "react";
import { bookarrApi, type PublicSettings } from "../api/client";

export function AdminSettings() {
  const [form, setForm] = useState<Partial<PublicSettings> & {
    prowlarrApiKey?: string;
    qbittorrentPassword?: string;
    sabnzbdApiKey?: string;
    hardcoverApiKey?: string;
  }>({});
  const [indexers, setIndexers] = useState<Array<{ id: number; name: string; protocol: string; enable: boolean }>>(
    []
  );
  const [clientsLabel, setClientsLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([bookarrApi.settings(), bookarrApi.indexers(), bookarrApi.downloadClients()])
      .then(([s, idx, dc]) => {
        setForm({
          ...s,
          prowlarrApiKey: "",
          qbittorrentPassword: "",
          sabnzbdApiKey: "",
          hardcoverApiKey: "",
        });
        setIndexers(idx);
        setClientsLabel(
          `torrent=${dc.torrent.kind} · usenet=${dc.usenet.kind} · mode=${dc.mode}`
        );
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {
        prowlarrUrl: form.prowlarrUrl,
        libraryRoot: form.libraryRoot,
        autoSearchOnApprove: form.autoSearchOnApprove,
        downloadClientMode: form.downloadClientMode,
        qbittorrentUrl: form.qbittorrentUrl,
        qbittorrentUsername: form.qbittorrentUsername,
        qbittorrentCategory: form.qbittorrentCategory,
        sabnzbdUrl: form.sabnzbdUrl,
        sabnzbdCategory: form.sabnzbdCategory,
        metadataMode: form.metadataMode,
        metadataCacheTtlHours: form.metadataCacheTtlHours,
      };
      if (form.prowlarrApiKey?.trim()) body.prowlarrApiKey = form.prowlarrApiKey.trim();
      if (form.qbittorrentPassword?.trim()) body.qbittorrentPassword = form.qbittorrentPassword.trim();
      if (form.sabnzbdApiKey?.trim()) body.sabnzbdApiKey = form.sabnzbdApiKey.trim();
      if (form.hardcoverApiKey?.trim()) body.hardcoverApiKey = form.hardcoverApiKey.trim();
      const s = await bookarrApi.updateSettings(body);
      setForm({
        ...s,
        prowlarrApiKey: "",
        qbittorrentPassword: "",
        sabnzbdApiKey: "",
        hardcoverApiKey: "",
      });
      const dc = await bookarrApi.downloadClients();
      setClientsLabel(`torrent=${dc.torrent.kind} · usenet=${dc.usenet.kind} · mode=${dc.mode}`);
      setMessage("Settings saved.");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-lead">Prowlarr, metadata providers, download clients, and library defaults.</p>
      {clientsLabel && <p className="flash">Clients: {clientsLabel}</p>}
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}

      <form onSubmit={onSave}>
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>General</h2>
          </div>
          <div className="form-grid">
            <label>
              Prowlarr URL
              <input
                value={form.prowlarrUrl ?? ""}
                onChange={(e) => set("prowlarrUrl", e.target.value)}
                placeholder="http://prowlarr:9696"
              />
            </label>
            <label>
              Prowlarr API key {form.prowlarrApiKeySet ? "(set — leave blank to keep)" : ""}
              <input
                value={form.prowlarrApiKey ?? ""}
                onChange={(e) => set("prowlarrApiKey", e.target.value)}
                type="password"
                autoComplete="off"
              />
            </label>
            <label>
              Library root
              <input
                value={form.libraryRoot ?? ""}
                onChange={(e) => set("libraryRoot", e.target.value)}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--ink)" }}>
              <input
                type="checkbox"
                checked={Boolean(form.autoSearchOnApprove)}
                onChange={(e) => set("autoSearchOnApprove", e.target.checked)}
              />
              Auto-search & grab on request approve
            </label>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Download clients</h2>
          </div>
          <div className="form-grid">
            <label>
              Client mode
              <select
                value={form.downloadClientMode ?? "mock"}
                onChange={(e) => set("downloadClientMode", e.target.value)}
              >
                <option value="mock">mock (no live clients)</option>
                <option value="auto">auto (use qBit/SAB when configured)</option>
              </select>
            </label>
          </div>
          <div className="form-grid two" style={{ paddingTop: 0 }}>
            <label>
              qBittorrent URL
              <input
                value={form.qbittorrentUrl ?? ""}
                onChange={(e) => set("qbittorrentUrl", e.target.value)}
                placeholder="http://qbittorrent:8080"
              />
            </label>
            <label>
              qBittorrent username
              <input
                value={form.qbittorrentUsername ?? ""}
                onChange={(e) => set("qbittorrentUsername", e.target.value)}
              />
            </label>
            <label>
              qBittorrent password {form.qbittorrentPasswordSet ? "(set)" : ""}
              <input
                value={form.qbittorrentPassword ?? ""}
                onChange={(e) => set("qbittorrentPassword", e.target.value)}
                type="password"
                autoComplete="off"
              />
            </label>
            <label>
              qBittorrent category
              <input
                value={form.qbittorrentCategory ?? ""}
                onChange={(e) => set("qbittorrentCategory", e.target.value)}
              />
            </label>
            <label>
              SABnzbd URL
              <input
                value={form.sabnzbdUrl ?? ""}
                onChange={(e) => set("sabnzbdUrl", e.target.value)}
                placeholder="http://sabnzbd:8080"
              />
            </label>
            <label>
              SABnzbd API key {form.sabnzbdApiKeySet ? "(set)" : ""}
              <input
                value={form.sabnzbdApiKey ?? ""}
                onChange={(e) => set("sabnzbdApiKey", e.target.value)}
                type="password"
                autoComplete="off"
              />
            </label>
            <label>
              SABnzbd category
              <input
                value={form.sabnzbdCategory ?? ""}
                onChange={(e) => set("sabnzbdCategory", e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Metadata providers</h2>
          </div>
          <div className="form-grid two">
            <label>
              Metadata mode
              <select
                value={form.metadataMode ?? "auto"}
                onChange={(e) => set("metadataMode", e.target.value)}
              >
                <option value="auto">auto (Open Library + optional Hardcover)</option>
                <option value="mock">mock (offline catalog)</option>
              </select>
            </label>
            <label>
              Cache TTL (hours)
              <input
                type="number"
                min={1}
                value={form.metadataCacheTtlHours ?? 24}
                onChange={(e) => set("metadataCacheTtlHours", Number(e.target.value))}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Hardcover API key {form.hardcoverApiKeySet ? "(set — leave blank to keep)" : "(optional)"}
              <input
                value={form.hardcoverApiKey ?? ""}
                onChange={(e) => set("hardcoverApiKey", e.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Bearer token from hardcover.app"
              />
            </label>
          </div>
          <div className="form-grid" style={{ paddingTop: 0 }}>
            <div>
              <button className="btn primary" type="submit">
                Save
              </button>
            </div>
          </div>
        </div>
      </form>

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
