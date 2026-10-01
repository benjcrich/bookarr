import fs from "node:fs";
import path from "node:path";
import type { Audiobook, ImportMode, RemotePathMapping } from "../domain/types.js";
import { log } from "../log.js";

const AUDIO_RE = /\.(m4b|mp3|m4a|flac|ogg|aac|opus)$/i;

export interface ImportResult {
  ok: boolean;
  importPath: string | null;
  detail: string;
  /** @deprecated Always false for successful imports; kept for callers */
  stub: boolean;
  mode?: ImportMode | "hardlink" | "copy" | "move";
  files?: string[];
  sourcePath?: string | null;
}

/**
 * Import completed download into Author/Title under libraryRoot.
 * Applies remote→local path mappings, then hardlinks/copies/moves audio files.
 * Missing source after mapping is a hard failure (retry-eligible) — not a stub success.
 */
export function importCompletedDownload(input: {
  libraryRoot: string;
  book: Audiobook | null;
  title: string;
  authorName?: string | null;
  outputPath: string | null;
  pathMappings?: RemotePathMapping[];
  importMode?: ImportMode;
}): ImportResult {
  const author = sanitize(input.authorName || input.book?.authorName || "Unknown Author");
  const title = sanitize(input.book?.title || input.title || "Unknown Title");
  const destDir = path.join(input.libraryRoot, author, title);
  const mode = input.importMode ?? "auto";
  const mappedSource = applyPathMappings(input.outputPath, input.pathMappings ?? []);

  log.info("download.import.start", {
    source: input.outputPath,
    mapped: mappedSource,
    dest: destDir,
    mode,
  });

  if (!mappedSource) {
    const detail =
      "Import failed: download client reported no output path. " +
      "Check the client finished writing files and that Bookarr can read its status API.";
    log.warn("download.import.fail", { dest: destDir, reason: detail });
    return { ok: false, importPath: null, detail, stub: false, sourcePath: null };
  }

  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const msg = (err as Error).message;
    const hint =
      code === "EACCES" || code === "EPERM"
        ? ` Permission denied writing library root (${input.libraryRoot}). ` +
          `Fix volume ownership (PUID/PGID / entrypoint chown) or host path permissions.`
        : "";
    const detail = `Could not create library path: ${msg}.${hint}`;
    log.warn("download.import.fail", { dest: destDir, reason: detail });
    return { ok: false, importPath: null, detail, stub: false, sourcePath: mappedSource };
  }

  const resolved = resolveSource(mappedSource);
  if (!resolved) {
    const detail =
      `Import failed: source not visible inside Bookarr at "${mappedSource}"` +
      (input.outputPath && input.outputPath !== mappedSource
        ? ` (client path was "${input.outputPath}")`
        : "") +
      `. Mount the download client's completed-download folder into this container and add a ` +
      `Remote Path Mapping in Admin → Settings (client path prefix → container path). ` +
      `Example: qBittorrent save path /downloads → container mount /downloads.`;
    log.warn("download.import.fail", {
      source: input.outputPath,
      mapped: mappedSource,
      dest: destDir,
      reason: "source_missing",
    });
    return { ok: false, importPath: null, detail, stub: false, sourcePath: mappedSource };
  }

  const audioFiles = collectAudioFiles(resolved);
  if (audioFiles.length === 0) {
    const detail =
      `Import failed: no audio files (.m4b/.mp3/.m4a/.flac/.ogg/…) under "${resolved}". ` +
      `Confirm the download completed and the path mapping points at the finished content.`;
    log.warn("download.import.fail", { source: resolved, dest: destDir, reason: "no_audio" });
    return { ok: false, importPath: null, detail, stub: false, sourcePath: resolved };
  }

  const importedNames: string[] = [];
  let usedMode: "hardlink" | "copy" | "move" = mode === "move" ? "move" : mode === "hardlink" ? "hardlink" : "copy";

  try {
    for (const from of audioFiles) {
      const base = uniqueName(destDir, path.basename(from));
      const to = path.join(destDir, base);
      const resultMode = transferFile(from, to, mode);
      usedMode = resultMode;
      importedNames.push(base);
    }
  } catch (err) {
    const detail = `Import failed while transferring files: ${(err as Error).message}`;
    log.warn("download.import.fail", {
      source: resolved,
      dest: destDir,
      reason: detail,
    });
    return { ok: false, importPath: null, detail, stub: false, sourcePath: resolved };
  }

  const marker = path.join(destDir, ".bookarr-imported");
  fs.writeFileSync(
    marker,
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        source: resolved,
        clientPath: input.outputPath,
        files: importedNames,
        mode: usedMode,
      },
      null,
      2
    )
  );

  const detail = `Imported ${importedNames.length} file(s) via ${usedMode} → ${destDir}`;
  log.info("download.import.success", {
    source: resolved,
    dest: destDir,
    mode: usedMode,
    files: importedNames.length,
  });
  return {
    ok: true,
    importPath: destDir,
    detail,
    stub: false,
    mode: usedMode,
    files: importedNames,
    sourcePath: resolved,
  };
}

/** Map client-reported path through remote→local prefixes (longest remote match wins). */
export function applyPathMappings(
  remotePath: string | null | undefined,
  mappings: RemotePathMapping[]
): string | null {
  if (remotePath == null || !String(remotePath).trim()) return null;
  let p = String(remotePath).trim();
  // Normalize Windows-style separators from some clients
  p = p.replace(/\\/g, "/");
  const sorted = [...mappings]
    .filter((m) => m.remote?.trim() && m.local?.trim())
    .map((m) => ({
      remote: m.remote.replace(/\\/g, "/").replace(/\/$/, ""),
      local: m.local.replace(/\\/g, "/").replace(/\/$/, ""),
    }))
    .sort((a, b) => b.remote.length - a.remote.length);

  for (const m of sorted) {
    if (p === m.remote || p.startsWith(m.remote + "/")) {
      return m.local + p.slice(m.remote.length);
    }
  }
  return p;
}

export function parsePathMappings(value: string | RemotePathMapping[] | null | undefined): RemotePathMapping[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((m) => ({ remote: String(m.remote ?? "").trim(), local: String(m.local ?? "").trim() }))
      .filter((m) => m.remote && m.local);
  }
  const trimmed = String(value).trim();
  if (!trimmed) return [];
  try {
    if (trimmed.startsWith("[")) return parsePathMappings(JSON.parse(trimmed) as RemotePathMapping[]);
  } catch {
    /* fall through */
  }
  // remote=local;remote2=local2
  return trimmed
    .split(/[;\n]+/)
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx <= 0) return null;
      return { remote: line.slice(0, idx).trim(), local: line.slice(idx + 1).trim() };
    })
    .filter((m): m is RemotePathMapping => Boolean(m?.remote && m?.local));
}

export function serializePathMappings(mappings: RemotePathMapping[]): string {
  return JSON.stringify(parsePathMappings(mappings));
}

function resolveSource(mapped: string): string | null {
  try {
    if (!fs.existsSync(mapped)) return null;
    const st = fs.statSync(mapped);
    if (st.isFile()) return path.dirname(mapped);
    if (st.isDirectory()) return mapped;
    return null;
  } catch {
    return null;
  }
}

function collectAudioFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && AUDIO_RE.test(ent.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function uniqueName(destDir: string, base: string): string {
  if (!fs.existsSync(path.join(destDir, base))) return base;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let i = 2;
  while (fs.existsSync(path.join(destDir, `${stem} (${i})${ext}`))) i++;
  return `${stem} (${i})${ext}`;
}

function transferFile(
  from: string,
  to: string,
  mode: ImportMode
): "hardlink" | "copy" | "move" {
  if (mode === "move") {
    fs.renameSync(from, to);
    return "move";
  }
  if (mode === "hardlink" || mode === "auto") {
    try {
      fs.linkSync(from, to);
      return "hardlink";
    } catch {
      if (mode === "hardlink") {
        // fall through to copy for hardlink preference when cross-device
      }
    }
  }
  fs.copyFileSync(from, to);
  return "copy";
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "").trim().slice(0, 120) || "Unknown";
}
