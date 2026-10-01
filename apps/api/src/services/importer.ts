import fs from "node:fs";
import path from "node:path";
import type { Audiobook, ImportMode } from "../domain/types.js";
import { log } from "../log.js";

const AUDIO_RE = /\.(m4b|mp3|m4a|flac|ogg|aac|opus)$/i;

export interface ImportResult {
  ok: boolean;
  importPath: string | null;
  detail: string;
  /** Always false — stub-success is removed */
  stub: boolean;
  files?: string[];
  mode?: ImportMode;
}

/**
 * Handle a completed download according to importMode.
 *
 * `libraryDirect` (default): the download client (e.g. qBittorrent) saves
 * directly into the library. Bookarr only verifies files and updates DB state —
 * no copy/move and no empty Author/Title stub folders.
 */
export function importCompletedDownload(input: {
  libraryRoot: string;
  book: Audiobook | null;
  title: string;
  authorName?: string | null;
  outputPath: string | null;
  importMode?: ImportMode;
}): ImportResult {
  const mode = input.importMode ?? "libraryDirect";
  if (mode === "libraryDirect") {
    return importLibraryDirect(input);
  }
  // Future modes intentionally not implemented — library-direct is the supported path.
  return importLibraryDirect(input);
}

function importLibraryDirect(input: {
  libraryRoot: string;
  book: Audiobook | null;
  title: string;
  authorName?: string | null;
  outputPath: string | null;
}): ImportResult {
  const clientPath = input.outputPath?.trim() || null;
  log.info("download.import.start", {
    mode: "libraryDirect",
    source: clientPath,
    libraryRoot: input.libraryRoot,
    title: input.title,
  });

  if (!clientPath) {
    const detail =
      "Library-direct import failed: download client reported no content/save path. " +
      "Point qBittorrent/SABnzbd category or save path at the same library mount Bookarr uses " +
      `(${input.libraryRoot}) and ensure the client status API returns a path.`;
    log.warn("download.import.fail", { mode: "libraryDirect", reason: "no_output_path" });
    return { ok: false, importPath: null, detail, stub: false, mode: "libraryDirect" };
  }

  let exists = false;
  try {
    exists = fs.existsSync(clientPath);
  } catch {
    exists = false;
  }

  if (!exists) {
    const detail =
      `Library-direct import failed: client path not visible to Bookarr: "${clientPath}". ` +
      `qBittorrent should download into the library folder Bookarr mounts ` +
      `(BOOKARR_LIBRARY_ROOT / ${input.libraryRoot}). Mount that same host path in both containers. ` +
      `Bookarr does not copy or invent stub folders in this mode.`;
    log.warn("download.import.fail", {
      mode: "libraryDirect",
      source: clientPath,
      reason: "path_not_visible",
    });
    return { ok: false, importPath: null, detail, stub: false, mode: "libraryDirect" };
  }

  const audio = listAudio(clientPath);
  if (audio.length === 0) {
    const detail =
      `Library-direct import failed: no audio files under "${clientPath}" yet. ` +
      `Wait for the client to finish writing, or check the save/category path.`;
    log.warn("download.import.fail", {
      mode: "libraryDirect",
      source: clientPath,
      reason: "no_audio",
    });
    return { ok: false, importPath: null, detail, stub: false, mode: "libraryDirect" };
  }

  // Prefer a directory path for the audiobook record
  let importPath = clientPath;
  try {
    if (fs.statSync(clientPath).isFile()) importPath = path.dirname(clientPath);
  } catch {
    /* keep clientPath */
  }

  const underLibrary = isPathInside(importPath, input.libraryRoot);
  const detail = underLibrary
    ? `Library-direct: marked available at ${importPath} (${audio.length} audio file(s); no copy/move).`
    : `Library-direct: marked available at ${importPath} (${audio.length} audio file(s)). ` +
      `Note: path is outside library root (${input.libraryRoot}) — prefer saving the client into the library mount.`;

  log.info("download.import.success", {
    mode: "libraryDirect",
    source: clientPath,
    importPath,
    files: audio.length,
    underLibrary,
  });

  return {
    ok: true,
    importPath,
    detail,
    stub: false,
    files: audio.map((f) => path.basename(f)),
    mode: "libraryDirect",
  };
}

function listAudio(target: string): string[] {
  try {
    const st = fs.statSync(target);
    if (st.isFile()) return AUDIO_RE.test(target) ? [target] : [];
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }
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
  walk(target);
  return out;
}

function isPathInside(child: string, parent: string): boolean {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
}

export function parseImportMode(value: string | undefined | null): ImportMode {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "librarydirect" || v === "library-direct" || v === "client-to-library" || v === "none") {
    return "libraryDirect";
  }
  return "libraryDirect";
}
