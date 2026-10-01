import fs from "node:fs";
import path from "node:path";
import type { Audiobook } from "../domain/types.js";

export interface ImportResult {
  ok: boolean;
  importPath: string | null;
  detail: string;
  stub: boolean;
}

/**
 * Import/rename hook when a download completes.
 * Creates Author/Title under libraryRoot and records a marker file when the
 * client output path is missing or not readable (graceful stub).
 */
export function importCompletedDownload(input: {
  libraryRoot: string;
  book: Audiobook | null;
  title: string;
  authorName?: string | null;
  outputPath: string | null;
}): ImportResult {
  const author = sanitize(input.authorName || input.book?.authorName || "Unknown Author");
  const title = sanitize(input.book?.title || input.title || "Unknown Title");
  const destDir = path.join(input.libraryRoot, author, title);

  try {
    fs.mkdirSync(destDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const msg = (err as Error).message;
    const hint =
      code === "EACCES" || code === "EPERM"
        ? ` Permission denied writing library root (${input.libraryRoot}). ` +
          `The container user cannot create folders there — usually a root-owned Docker volume or bind mount. ` +
          `Fix: restart with the latest image (entrypoint chowns /data), or set PUID/PGID to the volume owner, ` +
          `or on the host run: chown -R <PUID>:<PGID> <host-path-for-/data>. Existing DB files are preserved.`
        : "";
    return {
      ok: false,
      importPath: null,
      detail: `Could not create library path: ${msg}.${hint}`,
      stub: true,
    };
  }

  const marker = path.join(destDir, ".bookarr-imported");
  const hasSource =
    Boolean(input.outputPath) &&
    fs.existsSync(input.outputPath!) &&
    fs.statSync(input.outputPath!).isDirectory();

  if (hasSource) {
    try {
      // Soft import: copy audio-ish files when present; otherwise leave a stub marker.
      const entries = fs.readdirSync(input.outputPath!);
      const audio = entries.filter((f) => /\.(m4b|mp3|m4a|flac|ogg)$/i.test(f));
      if (audio.length > 0) {
        for (const file of audio) {
          const from = path.join(input.outputPath!, file);
          const to = path.join(destDir, file);
          if (!fs.existsSync(to)) fs.copyFileSync(from, to);
        }
        fs.writeFileSync(
          marker,
          JSON.stringify(
            {
              importedAt: new Date().toISOString(),
              source: input.outputPath,
              files: audio,
              mode: "copy",
            },
            null,
            2
          )
        );
        return {
          ok: true,
          importPath: destDir,
          detail: `Imported ${audio.length} file(s) to ${destDir}`,
          stub: false,
        };
      }
    } catch (err) {
      // fall through to stub
      fs.writeFileSync(
        marker,
        JSON.stringify({
          importedAt: new Date().toISOString(),
          source: input.outputPath,
          error: (err as Error).message,
          mode: "stub",
        })
      );
      return {
        ok: true,
        importPath: destDir,
        detail: `Import stubbed (copy failed): ${(err as Error).message}`,
        stub: true,
      };
    }
  }

  fs.writeFileSync(
    marker,
    JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        source: input.outputPath,
        mode: "stub",
        note: "Download completed but source path was unavailable; library folder reserved.",
      },
      null,
      2
    )
  );
  return {
    ok: true,
    importPath: destDir,
    detail: `Import stub: reserved ${destDir} (source not available locally).`,
    stub: true,
  };
}

function sanitize(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, "").trim().slice(0, 120) || "Unknown";
}
