import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDatabase(dbPath: string): Database.Database {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  seedIfEmpty(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      overview TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quality_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      preferred_formats TEXT NOT NULL,
      min_bitrate_kbps INTEGER NOT NULL DEFAULT 64
    );

    CREATE TABLE IF NOT EXISTS audiobooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES authors(id),
      overview TEXT,
      asin TEXT,
      narrator TEXT,
      monitored INTEGER NOT NULL DEFAULT 1,
      wanted INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'wanted',
      quality_profile_id INTEGER NOT NULL REFERENCES quality_profiles(id),
      path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(title, author_id)
    );

    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_name TEXT NOT NULL,
      overview TEXT,
      asin TEXT,
      narrator TEXT,
      requester_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      audiobook_id INTEGER REFERENCES audiobooks(id),
      deny_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS download_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      audiobook_id INTEGER REFERENCES audiobooks(id),
      title TEXT NOT NULL,
      indexer_id INTEGER,
      indexer_name TEXT,
      guid TEXT NOT NULL,
      download_url TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      protocol TEXT NOT NULL DEFAULT 'torrent',
      size INTEGER,
      error TEXT,
      client TEXT,
      external_id TEXT,
      progress REAL NOT NULL DEFAULT 0,
      output_path TEXT,
      import_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS metadata_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Additive migrations for DBs created before download-client columns existed
  const jobCols = new Set(
    (db.prepare("PRAGMA table_info(download_jobs)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  const addJob = (name: string, ddl: string) => {
    if (!jobCols.has(name)) db.exec(`ALTER TABLE download_jobs ADD COLUMN ${ddl}`);
  };
  addJob("client", "client TEXT");
  addJob("external_id", "external_id TEXT");
  addJob("progress", "progress REAL NOT NULL DEFAULT 0");
  addJob("output_path", "output_path TEXT");
  addJob("import_path", "import_path TEXT");

  const bookCols = new Set(
    (db.prepare("PRAGMA table_info(audiobooks)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  const addBook = (name: string, ddl: string) => {
    if (!bookCols.has(name)) db.exec(`ALTER TABLE audiobooks ADD COLUMN ${ddl}`);
  };
  addBook("isbn", "isbn TEXT");
  addBook("cover_url", "cover_url TEXT");
  addBook("runtime_minutes", "runtime_minutes INTEGER");

  const reqCols = new Set(
    (db.prepare("PRAGMA table_info(requests)").all() as Array<{ name: string }>).map((c) => c.name)
  );
  const addReq = (name: string, ddl: string) => {
    if (!reqCols.has(name)) db.exec(`ALTER TABLE requests ADD COLUMN ${ddl}`);
  };
  addReq("isbn", "isbn TEXT");
  addReq("cover_url", "cover_url TEXT");
}

function seedIfEmpty(db: Database.Database): void {
  const count = db.prepare("SELECT COUNT(*) AS c FROM quality_profiles").get() as { c: number };
  if (count.c > 0) return;

  db.prepare(
    `INSERT INTO quality_profiles (name, preferred_formats, min_bitrate_kbps) VALUES (?, ?, ?)`
  ).run("Any", "m4b,mp3,m4a", 64);
  db.prepare(
    `INSERT INTO quality_profiles (name, preferred_formats, min_bitrate_kbps) VALUES (?, ?, ?)`
  ).run("Prefer M4B", "m4b,mp3", 96);

  const insertAuthor = db.prepare(`INSERT INTO authors (name, overview) VALUES (?, ?)`);
  const brandon = insertAuthor.run(
    "Brandon Sanderson",
    "Epic fantasy author; Mistborn, Stormlight Archive."
  );
  const martha = insertAuthor.run(
    "Martha Wells",
    "Author of The Murderbot Diaries."
  );

  const insertBook = db.prepare(`
    INSERT INTO audiobooks
      (title, author_id, overview, asin, narrator, monitored, wanted, status, quality_profile_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBook.run(
    "The Way of Kings",
    brandon.lastInsertRowid,
    "First book of The Stormlight Archive.",
    "B003P9X5VM",
    "Kate Reading / Michael Kramer",
    1,
    1,
    "wanted",
    2
  );
  insertBook.run(
    "All Systems Red",
    martha.lastInsertRowid,
    "A Murderbot novella.",
    "B075DGHHQL",
    "Kevin R. Free",
    1,
    0,
    "available",
    1
  );

  db.prepare(
    `INSERT INTO requests (title, author_name, overview, asin, narrator, requester_name, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    "Mistborn: The Final Empire",
    "Brandon Sanderson",
    "First Mistborn novel.",
    "B002V0QUF2",
    "Michael Kramer",
    "alex",
    "pending"
  );

  const defaults: Record<string, string> = {
    libraryRoot: process.env.BOOKARR_LIBRARY_ROOT || "/data/audiobooks",
    qualityProfileId: "2",
    autoSearchOnApprove: "true",
    downloadClientMode: process.env.DOWNLOAD_CLIENT_MODE || "mock",
    qbittorrentUrl: process.env.QBITTORRENT_URL || "",
    qbittorrentUsername: process.env.QBITTORRENT_USERNAME || "admin",
    qbittorrentPassword: process.env.QBITTORRENT_PASSWORD || "",
    qbittorrentCategory: process.env.QBITTORRENT_CATEGORY || "bookarr",
    sabnzbdUrl: process.env.SABNZBD_URL || "",
    sabnzbdApiKey: process.env.SABNZBD_API_KEY || "",
    sabnzbdCategory: process.env.SABNZBD_CATEGORY || "bookarr",
    metadataMode: process.env.METADATA_MODE || "auto",
    hardcoverApiKey: process.env.HARDCOVER_API_KEY || "",
    metadataCacheTtlHours: process.env.METADATA_CACHE_TTL_HOURS || "24",
  };
  const set = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(defaults)) set.run(k, v);
}
