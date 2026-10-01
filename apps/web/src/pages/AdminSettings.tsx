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
  /** Comma-separated extras not in the checkbox list */
  manualIndexerIds?: string;
  manualCategories?: string;
};

const CATEGORY_PRESETS: Array<{ id: number; label: string }> = [
  { id: 3030, label: "Books/Audiobook (3030)" },
  { id: 3000, label: "Books (3000)" },
  { id: 7020, label: "Audio/Audiobook (7020)" },
];

function blankSecrets(
  s: PublicSettings,
  knownIndexerIds: Set<number> = new Set()
): SettingsForm {
  const knownCats = new Set(CATEGORY_PRESETS.map((c) => c.id));
  const manualCats = (s.prowlarrCategories ?? []).filter((id) => !knownCats.has(id));
  const checkedIndexers = (s.prowlarrIndexerIds ?? []).filter((id) => knownIndexerIds.has(id));
  const manualIndexers = (s.prowlarrIndexerIds ?? []).filter((id) => !knownIndexerIds.has(id));
  return {
    ...s,
    prowlarrIndexerIds: checkedIndexers,
    prowlarrCategories: (s.prowlarrCategories ?? []).filter((id) => knownCats.has(id)),
    prowlarrApiKey: "",
    qbittorrentPassword: "",
    sabnzbdApiKey: "",
    hardcoverApiKey: "",
    manualIndexerIds: manualIndexers.join(", "),
    manualCategories: manualCats.join(", "),
  };
}

function mergeIds(selected: number[], manual: string | undefined): number[] {
  const fromManual = (manual ?? "")
    .split(/[\s,;]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set([...selected, ...fromManual])].sort((a, b) => a - b);
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
        setIndexers(idx);
        setForm(blankSecrets(s, new Set(idx.map((i) => i.id))));
        setClientsLabel(
          `torrent=${dc.torrent.kind} · usenet=${dc.usenet.kind} · mode=${dc.mode}`
        );
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function set<K extends string>(key: K, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleIndexer(id: number, checked: boolean) {
    setForm((f) => {
      const current = new Set(f.prowlarrIndexerIds ?? []);
      if (checked) current.add(id);
      else current.delete(id);
      return { ...f, prowlarrIndexerIds: [...current].sort((a, b) => a - b) };
    });
  }

  function toggleCategory(id: number, checked: boolean) {
    setForm((f) => {
      const current = new Set(f.prowlarrCategories ?? []);
      if (checked) current.add(id);
      else current.delete(id);
      return { ...f, prowlarrCategories: [...current].sort((a, b) => a - b) };
    });
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
      const prowlarrIndexerIds = mergeIds(form.prowlarrIndexerIds ?? [], form.manualIndexerIds);
      const prowlarrCategories = mergeIds(form.prowlarrCategories ?? [], form.manualCategories);

      const body: Record<string, unknown> = {
        prowlarrUrl: form.prowlarrUrl,
        prowlarrIndexerIds,
        prowlarrCategories,
        libraryRoot: form.libraryRoot,
        importMode: form.importMode ?? "libraryDirect",
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
        logLevel: form.logLevel,
        downloadRetryMaxAttempts: form.downloadRetryMaxAttempts,
        downloadRetryBaseDelayMs: form.downloadRetryBaseDelayMs,
      };
      if (form.prowlarrApiKey?.trim()) body.prowlarrApiKey = form.prowlarrApiKey.trim();
      if (form.qbittorrentPassword?.trim()) body.qbittorrentPassword = form.qbittorrentPassword.trim();
      if (form.sabnzbdApiKey?.trim()) body.sabnzbdApiKey = form.sabnzbdApiKey.trim();
      if (form.hardcoverApiKey?.trim()) body.hardcoverApiKey = form.hardcoverApiKey.trim();
      const s = await bookarrApi.updateSettings(body);
      setForm(blankSecrets(s, new Set(indexers.map((i) => i.id))));
      await refreshClients();
      const filterNote =
        prowlarrIndexerIds.length || prowlarrCategories.length
          ? ` Search filters: indexers=${prowlarrIndexerIds.join(",") || "all"} categories=${prowlarrCategories.join(",") || "none"}.`
          : " Search: all indexers, no category filter.";
      setMessage(`Settings saved. Changes apply immediately (no restart).${filterNote}`);
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
      setForm(blankSecrets(s, new Set(indexers.map((i) => i.id))));
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

  const selectedIndexers = new Set(form.prowlarrIndexerIds ?? []);
  const selectedCategories = new Set(form.prowlarrCategories ?? []);

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-lead">
        Runtime config is saved in SQLite and wins over env after first boot. Limit Prowlarr search
        to audiobook indexers and/or Newznab categories (either or both).
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

          <div className="form-grid" style={{ paddingTop: 0 }}>
            <div>
              <div className="meta" style={{ marginBottom: "0.5rem" }}>
                Search indexers — empty selection = all indexers. Checked IDs are sent as{" "}
                <code>indexerIds</code>.
              </div>
              {indexers.length === 0 ? (
                <div className="empty">No indexers returned from Prowlarr.</div>
              ) : (
                <div className="check-list">
                  {indexers.map((i) => (
                    <label key={i.id} className="check-row">
                      <input
                        type="checkbox"
                        checked={selectedIndexers.has(i.id)}
                        onChange={(e) => toggleIndexer(i.id, e.target.checked)}
                      />
                      <span>
                        {i.name}{" "}
                        <span className="meta">
                          id {i.id} · {i.protocol}
                          {!i.enable ? " · disabled" : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <label style={{ marginTop: "0.75rem" }}>
                Extra indexer IDs (comma-separated)
                <input
                  value={form.manualIndexerIds ?? ""}
                  onChange={(e) => set("manualIndexerIds", e.target.value)}
                  placeholder="e.g. 12, 15"
                />
              </label>
            </div>

            <div>
              <div className="meta" style={{ marginBottom: "0.5rem" }}>
                Categories — empty = no category filter. Sent as <code>categories</code> (e.g. 3030
                = Books/Audiobook).
              </div>
              <div className="check-list">
                {CATEGORY_PRESETS.map((c) => (
                  <label key={c.id} className="check-row">
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(c.id)}
                      onChange={(e) => toggleCategory(c.id, e.target.checked)}
                    />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
              <label style={{ marginTop: "0.75rem" }}>
                Extra category IDs (comma-separated)
                <input
                  value={form.manualCategories ?? ""}
                  onChange={(e) => set("manualCategories", e.target.value)}
                  placeholder="e.g. 3030, 7020"
                />
              </label>
            </div>
          </div>
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
              Import / completion mode
              <select
                value={form.importMode ?? "libraryDirect"}
                onChange={(e) => set("importMode", e.target.value)}
              >
                <option value="libraryDirect">
                  Library-direct (client saves into library; no copy/move)
                </option>
              </select>
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
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", color: "var(--muted, #6b7280)" }}>
            Library-direct: point qBittorrent / SABnzbd category or save path at the same mount as Library
            root (e.g. <code>/data/audiobooks</code>). When the client reports complete, Bookarr verifies
            audio files and marks the book available — it does not copy, move, or create empty Author/Title
            stubs.
          </p>
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
            <label>
              Log level
              <select
                value={form.logLevel ?? "info"}
                onChange={(e) => set("logLevel", e.target.value)}
              >
                <option value="info">info (default — quiet HTTP)</option>
                <option value="debug">debug (verbose HTTP + poll)</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
            </label>
            <label>
              Download retry max attempts
              <input
                type="number"
                min={1}
                max={50}
                value={form.downloadRetryMaxAttempts ?? 5}
                onChange={(e) => set("downloadRetryMaxAttempts", Number(e.target.value))}
              />
            </label>
            <label>
              Retry base delay (ms)
              <input
                type="number"
                min={100}
                step={100}
                value={form.downloadRetryBaseDelayMs ?? 10000}
                onChange={(e) => set("downloadRetryBaseDelayMs", Number(e.target.value))}
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
    </>
  );
}
