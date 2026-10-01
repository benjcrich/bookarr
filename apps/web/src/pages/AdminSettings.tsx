import { useEffect, useState, type FormEvent } from "react";
import {
  bookarrApi,
  type PublicSettings,
  type SecretSettingKey,
  type SettingsTestResult,
} from "../api/client";

type SettingsForm = Partial<PublicSettings> & {
  prowlarrApiKey?: string;
  qbittorrentPassword?: string;
  sabnzbdApiKey?: string;
  hardcoverApiKey?: string;
};

function blankSecrets(s: PublicSettings): SettingsForm {
  return {
    ...s,
    prowlarrApiKey: "",
    qbittorrentPassword: "",
    sabnzbdApiKey: "",
    hardcoverApiKey: "",
  };
}

export function AdminSettings() {
  const [form, setForm] = useState<SettingsForm>({});
  const [indexers, setIndexers] = useState<Array<{ id: number; name: string; protocol: string; enable: boolean }>>(
    []
  );
  const [clientsLabel, setClientsLabel] = useState("");
  const [testResult, setTestResult] = useState<SettingsTestResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    Promise.all([bookarrApi.settings(), bookarrApi.indexers(), bookarrApi.downloadClients()])
      .then(([s, idx, dc]) => {
        setForm(blankSecrets(s));
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

  async function refreshClients() {
    const dc = await bookarrApi.downloadClients();
    setClientsLabel(`torrent=${dc.torrent.kind} · usenet=${dc.usenet.kind} · mode=${dc.mode}`);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        prowlarrUrl: form.prowlarrUrl,
        libraryRoot: form.libraryRoot,
        qualityProfileId: form.qualityProfileId,
        autoSearchOnApprove: form.autoSearchOnApprove,
        downloadClientMode: form.downloadClientMode,
        qbittorrentUrl: form.qbittorrentUrl,
        qbittorrentUsername: form.qbittorrentUsername,
        qbittorrentCategory: form.qbittorrentCategory,
        sabnzbdUrl: form.sabnzbdUrl,
        sabnzbdCategory: form.sabnzbdCategory,
        metadataMode: form.metadataMode,
        metadataCacheTtlHours: form.metadataCacheTtlHours,
        downloadPollMs: form.downloadPollMs,
        mockDownloadMs: form.mockDownloadMs,
      };
      if (form.prowlarrApiKey?.trim()) body.prowlarrApiKey = form.prowlarrApiKey.trim();
      if (form.qbittorrentPassword?.trim()) body.qbittorrentPassword = form.qbittorrentPassword.trim();
      if (form.sabnzbdApiKey?.trim()) body.sabnzbdApiKey = form.sabnzbdApiKey.trim();
      if (form.hardcoverApiKey?.trim()) body.hardcoverApiKey = form.hardcoverApiKey.trim();
      const s = await bookarrApi.updateSettings(body);
      setForm(blankSecrets(s));
      await refreshClients();
      setMessage("Settings saved. Changes apply immediately (no restart).");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(key: SecretSettingKey, label: string) {
    setError(null);
    setMessage(null);
    try {
      const s = await bookarrApi.updateSettings({ clearSecrets: [key] });
      setForm(blankSecrets(s));
      await refreshClients();
      setMessage(`${label} cleared.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onTest() {
    setError(null);
    setMessage(null);
    setTesting(true);
    try {
      const result = await bookarrApi.testSettings();
      setTestResult(result);
      setMessage("Connection test finished.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-lead">
        Runtime config is saved in SQLite and wins over env after first boot. Env only bootstraps
        missing keys (compose secrets, first deploy). Ports and data paths stay compose-level.
      </p>
      {clientsLabel && <p className="flash">Clients: {clientsLabel}</p>}
      {form.note && <p className="flash">{form.note}</p>}
      {message && <p className="flash">{message}</p>}
      {error && <p className="flash error">{error}</p>}

      <form onSubmit={onSave}>
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Prowlarr</h2>
          </div>
          <div className="form-grid two">
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
          </div>
          {form.prowlarrApiKeySet && (
            <div className="form-grid" style={{ paddingTop: 0 }}>
              <div>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => clearSecret("prowlarrApiKey", "Prowlarr API key")}
                >
                  Clear API key
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Library & automation</h2>
          </div>
          <div className="form-grid two">
            <label>
              Library root
              <input
                value={form.libraryRoot ?? ""}
                onChange={(e) => set("libraryRoot", e.target.value)}
                placeholder="/data/audiobooks"
              />
            </label>
            <label>
              Default quality profile ID
              <input
                type="number"
                min={1}
                value={form.qualityProfileId ?? 2}
                onChange={(e) => set("qualityProfileId", Number(e.target.value))}
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
              qBittorrent password {form.qbittorrentPasswordSet ? "(set — leave blank to keep)" : ""}
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
            {form.qbittorrentPasswordSet && (
              <div>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => clearSecret("qbittorrentPassword", "qBittorrent password")}
                >
                  Clear password
                </button>
              </div>
            )}
            <label>
              SABnzbd URL
              <input
                value={form.sabnzbdUrl ?? ""}
                onChange={(e) => set("sabnzbdUrl", e.target.value)}
                placeholder="http://sabnzbd:8080"
              />
            </label>
            <label>
              SABnzbd API key {form.sabnzbdApiKeySet ? "(set — leave blank to keep)" : ""}
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
            {form.sabnzbdApiKeySet && (
              <div>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => clearSecret("sabnzbdApiKey", "SABnzbd API key")}
                >
                  Clear API key
                </button>
              </div>
            )}
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
          {form.hardcoverApiKeySet && (
            <div className="form-grid" style={{ paddingTop: 0 }}>
              <div>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => clearSecret("hardcoverApiKey", "Hardcover API key")}
                >
                  Clear Hardcover key
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Runtime</h2>
          </div>
          <div className="form-grid two">
            <label>
              Download poll interval (ms)
              <input
                type="number"
                min={500}
                step={100}
                value={form.downloadPollMs ?? 3000}
                onChange={(e) => set("downloadPollMs", Number(e.target.value))}
              />
            </label>
            <label>
              Mock download duration (ms)
              <input
                type="number"
                min={100}
                step={100}
                value={form.mockDownloadMs ?? 1500}
                onChange={(e) => set("mockDownloadMs", Number(e.target.value))}
              />
            </label>
          </div>
          <div className="form-grid" style={{ paddingTop: 0 }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save settings"}
              </button>
              <button className="btn" type="button" onClick={onTest} disabled={testing}>
                {testing ? "Testing…" : "Test connections"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {testResult && (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="panel-head">
            <h2>Connection test</h2>
          </div>
          <div className="row">
            <div>
              <h3>Prowlarr</h3>
              <div className="meta">{testResult.prowlarr.detail}</div>
            </div>
            <div>
              <span className="badge">{testResult.prowlarr.mode}</span>
            </div>
            <div />
          </div>
          <div className="row">
            <div>
              <h3>Torrent client</h3>
              <div className="meta">{testResult.downloadClients.torrent.detail}</div>
            </div>
            <div>
              <span className={`badge ${testResult.downloadClients.torrent.ok ? "available" : "denied"}`}>
                {testResult.downloadClients.torrent.kind}
              </span>
            </div>
            <div />
          </div>
          <div className="row">
            <div>
              <h3>Usenet client</h3>
              <div className="meta">{testResult.downloadClients.usenet.detail}</div>
            </div>
            <div>
              <span className={`badge ${testResult.downloadClients.usenet.ok ? "available" : "denied"}`}>
                {testResult.downloadClients.usenet.kind}
              </span>
            </div>
            <div />
          </div>
          <div className="row">
            <div>
              <h3>Metadata</h3>
              <div className="meta">
                OL: {testResult.metadata.openLibrary} · HC: {testResult.metadata.hardcover}
              </div>
            </div>
            <div>
              <span className="badge">{testResult.metadata.mode}</span>
            </div>
            <div />
          </div>
        </div>
      )}

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
